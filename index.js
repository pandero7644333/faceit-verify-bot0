const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const axios = require("axios");
require("dotenv").config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const roleMap = {
  1: "1488562516668973066",
  2: "1488562786240827392",
  3: "1488562754670428461",
  4: "1488562731559686248",
  5: "1488562709158039696",
  6: "1488562683816054874",
  7: "1488562659334029373",
  8: "1488562634738634773",
  9: "1488562579931398306",
  10: "1488562554237354076"
};

const pending = new Map();

function extractSteamID(url) {
  const match = url.match(/(\d{17})/);
  return match ? match[1] : null;
}

async function getFaceitBySteam(steamId) {
  const res = await axios.get(
    `https://open.faceit.com/data/v4/players?game=cs2&game_player_id=${steamId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.FACEIT_KEY}`
      }
    }
  );
  return res.data;
}

const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("FACEIT verify")
    .addSubcommand(sub =>
      sub
        .setName("faceit")
        .setDescription("Steam → FACEIT")
        .addStringOption(opt =>
          opt.setName("link")
            .setDescription("Steam link")
            .setRequired(true)
        )
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("BOT READY");
});

client.on("interactionCreate", async (interaction) => {

  if (interaction.isChatInputCommand()) {

    if (interaction.commandName === "verify") {

      const link = interaction.options.getString("link");
      const steamId = extractSteamID(link);

      if (!steamId) {
        return interaction.reply({ content: "❌ zły link", ephemeral: true });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();

      pending.set(interaction.user.id, { steamId, code });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("copy")
          .setLabel("📋 Kopiuj kod")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("check")
          .setLabel("🔎 Sprawdź FACEIT")
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        content:
          `🔐 Wklej kod do FACEIT BIO:\n\n**${code}**`,
        components: [row],
        ephemeral: true
      });
    }
  }

  if (interaction.isButton()) {

    const data = pending.get(interaction.user.id);
    if (!data) return interaction.reply({ content: "brak verify", ephemeral: true });

    if (interaction.customId === "copy") {
      return interaction.reply({
        content: `📋 Kod: **${data.code}**`,
        ephemeral: true
      });
    }

    if (interaction.customId === "check") {

      const faceitRes = await getFaceitBySteam(data.steamId);

      if (!faceitRes.player_id) {
        return interaction.reply({ content: "❌ brak FACEIT", ephemeral: true });
      }

      const profile = await axios.get(
        `https://open.faceit.com/data/v4/players/${faceitRes.player_id}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FACEIT_KEY}`
          }
        }
      );

      const level = profile.data.games?.cs2?.skill_level;

      const role = interaction.guild.roles.cache.get(roleMap[level]);

      await interaction.member.roles.add(role);

      pending.delete(interaction.user.id);

      return interaction.reply({
        content: `✅ LEVEL ${level}`,
        ephemeral: true
      });
    }
  }
});

client.login(process.env.TOKEN);
