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

// STEAM ID
async function getSteamID(url) {
  const match = url.match(/(\d{17})/);
  if (match) return match[1];

  const vanity = url.match(/id\/([^\/]+)/)?.[1];
  if (!vanity) return null;

  const res = await axios.get(
    `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${process.env.STEAM_KEY}&vanityurl=${vanity}`
  );

  return res.data.response.steamid;
}

// STEAM PROFILE
async function getSteamProfile(steamId) {
  const res = await axios.get(
    `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_KEY}&steamids=${steamId}`
  );

  return res.data.response.players[0];
}

// FACEIT
async function getFaceit(steamId) {
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

// COMMAND
const commands = [
  new SlashCommandBuilder()
    .setName("zweryfikuj")
    .setDescription("FACEIT verify")
    .addSubcommand(sub =>
      sub
        .setName("ranking")
        .setDescription("Verify FACEIT")
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

    const link = interaction.options.getString("link");
    const steamId = await getSteamID(link);

    if (!steamId) {
      return interaction.reply({ content: "❌ Zły link", ephemeral: true });
    }

    const faceit = await getFaceit(steamId);

    if (!faceit.player_id) {
      return interaction.reply({ content: "❌ Brak FACEIT", ephemeral: true });
    }

    const code = Math.floor(100000 + Math.random() * 900000);

    pending.set(interaction.user.id, {
      steamId,
      code
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("check")
        .setLabel("🔎 Sprawdź")
        .setStyle(ButtonStyle.Success)
    );

    return interaction.reply({
      content:
        `🔐 Zmień nazwę Steam na:\n\n` +
        `**${faceit.nickname} | ${code}**\n\n` +
        `Następnie kliknij Sprawdź`,
      components: [row],
      ephemeral: true
    });
  }

  if (interaction.isButton()) {

    const data = pending.get(interaction.user.id);
    if (!data) return;

    const profile = await getSteamProfile(data.steamId);

    if (!profile.personaname.includes(data.code)) {
      return interaction.reply({
        content: "❌ Kod nie znaleziony w nicku Steam",
        ephemeral: true
      });
    }

    const faceit = await getFaceit(data.steamId);

    const profileFaceit = await axios.get(
      `https://open.faceit.com/data/v4/players/${faceit.player_id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FACEIT_KEY}`
        }
      }
    );

    const level = profileFaceit.data.games?.cs2?.skill_level;

    const role = interaction.guild.roles.cache.get(roleMap[level]);

    await interaction.member.roles.add(role);

    pending.delete(interaction.user.id);

    return interaction.reply({
      content: `✅ Zweryfikowano! Level: ${level}`,
      ephemeral: true
    });
  }
});

client.login(process.env.TOKEN);
