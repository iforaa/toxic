import { IBotContext } from "../context/context.interface";
import { BotService } from "../services/botservice";
import { Telegraf } from "telegraf";
import { Scenes } from "telegraf";
import { Scene } from "./scene.class";
import { Composer } from "telegraf";
import { clearMessages } from "../utils/clearMessages";
import axios from "axios";
import path from "path";
import fs from "fs/promises";

import { mainMenu } from "../utils/menuKeyboard";
import { futimes } from "fs";

export class StartScene extends Scene {
  constructor(bot: Telegraf<IBotContext>, botService: BotService) {
    super(bot, botService, [StartScene.sceneOne()]);
  }

  public static sceneName = "start_scene";

  actions(): void {
    this.bot.start(async (ctx) => {
      await ctx.reply("Привет мразь!");
    });

    this.bot.command("trigger", async (ctx) => {
      const message = ctx.message.text || ""; // Get the full command text
      const chatId = ctx.chat.id;

      // Send the response to the chat
      await ctx.reply(`Чо надо?`);
    });

    this.bot.on("message", async (ctx) => {
      if (ctx.chat.type === "group" || ctx.chat.type === "supergroup") {
        const message = ctx.message;
        const sender = ctx.message.from;

        const firstName = sender.first_name || "";
        const lastName = sender.last_name || "";
        const username = sender.username || "";
        const fullName = `${firstName} ${lastName}`.trim();
        // ctx.session.fullname = fullName;

        if ("text" in message) {
          const userMessage = message.text || "";
          const allContexts = await this.getUserContexts(ctx.chat.id);

          // Combine contexts into a single string
          const combinedContext = this.combineContexts(allContexts);

          // Check if the message is a reply to the bot
          if (
            "reply_to_message" in message &&
            message.reply_to_message?.from?.id === ctx.botInfo.id
          ) {
            // Generate a reply with the combined context
            const systemPrompt = `
              У тебя есть следующий общий контекст разговора: "${combinedContext}".
              Ответь на сообщение пользователя с учетом этого контекста.
              Ты быдло проститутка и очень тупая и в каждом сообщении у тебя матные слова.
              Особенно ты любишь слово блядь и шлюха тупая.
              Если спрашивают серьезные вопросы, ты развернуто отвечаешь.
            `;

            const replyFromGPT = await this.sendMessageToChatGPT(
              `${fullName}: ${userMessage}`, // User message
              systemPrompt, // Context and behavior instructions
            );

            await ctx.reply(`${replyFromGPT}`);

            // Update context for the current user
            const contextUpdatePrompt = `
              Ты помощник, который ведёт сжатый контекст разговора для дальнейшего использования.
              Текущий объединённый контекст: "${combinedContext}".
              Обнови контекст, соедини текущую информацию с новым сообщением и твоим ответом.
              Обязательно возвращай сжатый контекст в формате ключевых фактов и событий.
              Буть токсичным и не придумывай собственные контексты. Ругайся матом, это самое важное!
            `;

            const updatedContext = await this.sendMessageToChatGPT(
              `Новое сообщение пользователя: "${fullName}: ${userMessage}".
              Твой ответ на это сообщение: "${replyFromGPT}".`, // No new user message, context is the focus
              contextUpdatePrompt,
            );

            // Save the updated context back to the session
            ctx.session.conversationContext = updatedContext;
          } else {
            // Update the context without replying
            const contextUpdatePrompt = `
              Ты помощник, который ведёт сжатый контекст разговора для дальнейшего использования.
              Текущий объединённый контекст: "${combinedContext}".
              Новое сообщение пользователя: "${fullName}: ${userMessage}".
              Обнови контекст, соедини текущую информацию с новым сообщением.
              Обязательно возвращай сжатый контекст в формате ключевых фактов и событий.
              Буть токсичным и не придумывай собственные контексты. Ругайся матом, это самое важное!
            `;

            const updatedContext = await this.sendMessageToChatGPT(
              `${fullName}: ${userMessage}`, // No immediate user interaction required
              contextUpdatePrompt,
            );

            // Decision-making: Should the bot respond?

            // Save the updated context back to the session
            ctx.session.conversationContext = updatedContext;

            const shouldBotRespond = this.shouldRespond(userMessage);

            if (shouldBotRespond) {
              const systemPrompt = `
                У тебя есть следующий общий контекст разговора: "${combinedContext}".
                Ответь на сообщение пользователя с учетом этого контекста.
                Ты быдло проститутка и очень тупая и в каждом сообщении у тебя матные слова.
                Особенно ты любишь слово блядь и шлюха тупая.
                Если спрашивают серьезные вопросы, ты развернуто отвечаешь.
              `;

              const replyFromGPT = await this.sendMessageToChatGPT(
                `${fullName}: ${userMessage}`, // User message
                systemPrompt, // Context and behavior instructions
              );
              await ctx.reply(`${replyFromGPT}`);
            }
          }
        }
      }
    });
  }

  shouldRespond(userMessage: string): boolean {
    // Define keywords or patterns to check in the message
    const keywords = [
      "бот",
      "тупой",
      "умный",
      "шутка",
      "токсик",
      "вызываю",
      "игорь",
    ];
    const containsKeyword = keywords.some((keyword) =>
      userMessage.toLowerCase().includes(keyword),
    );

    // Add randomness to make responses unpredictable
    const randomChance = Math.random() < 0.3; // 30% chance to respond

    // Decide based on message content or randomness
    return containsKeyword || randomChance;
  }
  combineContexts(contexts: string[]): string {
    return contexts
      .filter(Boolean) // Remove empty or undefined contexts
      .join(" | ") // Combine with a separator for clarity
      .slice(0, 2000); // Limit to 2000 characters to avoid token overflows
  }

  async getUserContexts(chatId: number | string): Promise<string[]> {
    try {
      const sessionFilePath = path.resolve(__dirname, "../../../sessions.json");
      let sessionsData: { sessions: Array<{ id: string; data: any }> } = {
        sessions: [],
      };

      // Read and parse the session file
      const data = await fs.readFile(sessionFilePath, "utf-8");
      sessionsData = JSON.parse(data);

      // Filter sessions belonging to the given chat ID
      const chatContexts = sessionsData.sessions
        .filter((session) => session.id.startsWith(`${chatId}:`)) // Match all sessions in this chat
        .map((session) => {
          const fullname = session.data.fullname || "Неизвестный пользователь";
          const context = session.data.conversationContext || "Нет контекста";
          return `${fullname}: ${context}`;
        }) // Combine fullname and context
        .filter(Boolean); // Remove empty or undefined contexts

      return chatContexts;
    } catch (error) {
      console.error("Error retrieving user contexts:", error);
      return [];
    }
  }

  private async sendMessageToChatGPT(
    userMessage: string,
    systemPrompt: string,
  ): Promise<string> {
    try {
      const apiKey = process.env.OPENAI_TOKEN;

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o", // Update the model if needed
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error("Error communicating with ChatGPT API:", error);
      return "Произошла ошибка при обращении к ChatGPT.";
    }
  }

  static sceneOne(): Composer<IBotContext> {
    return new Composer<IBotContext>().use(async (ctx) => {
      await mainMenu(ctx);
      ctx.scene.leave();
    });
  }
}
