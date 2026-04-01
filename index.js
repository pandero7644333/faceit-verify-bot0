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

// 🔥 ROLE MAP
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


// 🔎 STEAM ID RESOLVE (ID + PROFILES)
async function extractSteamID(url) {
  // jeśli jest już SteamID64
  const match = url.match(/(\d{17})/);
  if (match) return match[1];

  // jeśli vanity URL (/id/)
  const vanityMatch = url.match(/steamcommunity\.com\/id\/([^\/]+)/);
  if (!vanityMatch) return null;

  const vanity = vanityMatch[1];

  try {
    const res = await axios.get(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_KEY}&vanityurl=${vanity}`
    );

    return res.data.response.steamid;
  } catch (err) {
    console.error("Steam API error:", err);
    return null;
  }
}


// 🔐 FACEIT API
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


// 📌 COMMAND
const commands = [
  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("FACEIT verify")
    .addSubcommand(sub =>
      sub
        .setName("faceit")
        .setDescription("Verify Steam → FACEIT")
        .addStringOption(opt =>
          opt.setName("link")
            .setDescription("Steam profile link")
            .setRequired(true)
        )
    )
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);


// 🚀 START
client.once("ready", async () => {
  console.log(`✅ Logged as ${client.user.tag}`);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("✅ Commands ready");
});


// 💬 INTERACTIONS
client.on("interactionCreate", async (interaction) => {

  // ===== SLASH =====
  if (interaction.isChatInputCommand()) {

    if (
      interaction.commandName === "verify" &&
      interaction.options.getSubcommand() === "faceit"
    ) {

      const link = interaction.options.getString("link");

      const steamId = await extractSteamID(link);

      if (!steamId) {
        return interaction.reply({
          content: "❌ Nie mogę odczytać Steam ID z linku",
          ephemeral: true
        });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();

      pending.set(interaction.user.id, {
        steamId,
        code
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("copy_code")
          .setLabel("📋 Kopiuj kod")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("check_faceit")
          .setLabel("🔎 Sprawdź FACEIT")
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        content:
          `🔐 Wklej ten kod do BIO FACEIT:\n\n` +
          `**${code}**\n\n` +
          `Następnie kliknij "Sprawdź FACEIT"`,
        components: [row],
        ephemeral: true
      });
    }
  }


  // ===== BUTTONS =====
  if (interaction.isButton()) {

    const data = pending.get(interaction.user.id);

    if (!data) {
      return interaction.reply({
        content: "❌ Brak aktywnej weryfikacji",
        ephemeral: true
      });
    }

    // 📋 COPY
    if (interaction.customId === "copy_code") {
      return interaction.reply({
        content: `📋 Twój kod: **${data.code}**`,
        ephemeral: true
      });
    }

    // 🔎 VERIFY
    if (interaction.customId === "check_faceit") {

      try {
        const faceitRes = await getFaceitBySteam(data.steamId);

        if (!faceitRes.player_id) {
          return interaction.reply({
            content: "❌ Nie znaleziono konta FACEIT",
            ephemeral: true
          });
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

        if (!level) {
          return interaction.reply({
            content: "❌ Brak levelu FACEIT",
            ephemeral: true
          });
        }

        const roleId = roleMap[level];
        const role = interaction.guild.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: "❌ Nie znaleziono roli na serwerze",
            ephemeral: true
          });
        }

        await interaction.member.roles.add(role);

        pending.delete(interaction.user.id);

        return interaction.reply({
          content: `✅ Zweryfikowano! Twój FACEIT Level: **${level}**`,
          ephemeral: true
        });

      } catch (err) {
        console.error(err);
        return interaction.reply({
          content: "❌ Błąd FACEIT API",
          ephemeral: true
        });
      }
    }
  }
});

client.login(process.env.TOKEN);
