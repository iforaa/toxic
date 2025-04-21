import { Telegraf, Scenes, Composer } from "telegraf";
import { Command } from "./src/commands/command.class";
import { IConfigService } from "./src/config/config.interface";
import { ConfigService } from "./src/config/config.service";
import { IBotContext } from "./src/context/context.interface";
import LocalSession from "telegraf-session-local";
import { DBRepository } from "./src/repository/db.repository";
import { BotService } from "./src/services/botservice";
import { DbService } from "./src/services/db.service";
import { DatastoreService } from "./src/services/datastore.service";
import { StartScene } from "./src/scenes/start.scene";
import { Scene } from "./src/scenes/scene.class";

class Bot {
  bot: Telegraf<IBotContext>;
  scenes: Scene[] = [];
  private botService: BotService;

  constructor(private readonly configService: IConfigService) {
    this.bot = new Telegraf<IBotContext>(this.configService.get("TOKEN"));
    this.bot.use(new LocalSession({ database: "sessions.json" }).middleware());

    this.botService = new BotService(
      new DBRepository(new DbService(this.configService.get("PG_ADDRESS"))),
      new DatastoreService(this.configService.get("DATASTORE_URL")),
    );
  }

  init() {
    this.scenes = [new StartScene(this.bot, this.botService)];

    const stage = new Scenes.Stage<IBotContext>(this.scenes);
    this.bot.use(stage.middleware());

    for (const scene of this.scenes) {
      scene.actions();
    }

    this.bot.launch();
  }
}

const bot = new Bot(new ConfigService());
bot.init();
