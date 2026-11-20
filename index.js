
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ChannelSelectMenuBuilder,
  AttachmentBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

// ==========================================
// CEMETERY - CONFIGURAÇÕES PRINCIPAIS
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const OWNER_IDS = [
  "1541239768010981378",
  "1533306874513068093"
];

const DATA_PATH = path.join(__dirname, "data.json");

const DEFAULT_COOLDOWN = 600;
const DEFAULT_PROCESSING_DELAY = 5000;
const MAX_MEDIA_SIZE = 25 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 1800;

// ==========================================
// CLIENT
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message
  ]
});

// ==========================================
// EMOJIS
// ==========================================

const EMOJIS = {
  like: "<:like:1552007813709172766>",
  comment: "<:texto:1550347093586223184>",
  instagram: "<:insta:1552009638487138427>",
  link: "<:link:1552009621999452160>",
  delete: "<:lixo:1552009637170253894>",
  config: "<:config:1552010601688080457>",
  alert: "<a:alerta:1552007804569653360>",
  positive: "<:positivo:1550347075089211432>",
  negative: "<:negativo:1550347078893441111>",
  loading: "<a:load:1552508772432347189>",
  document: "<:documento:1552009636251566130>",
  clock: "<:horrio:1550347082634760202>",
  shield: "<:escudo:1552508771228450856>",
  tiktok: "<:play:1552762285502627930>",
  ticket: "<:ticket_fallens:1552761934733119709>",
  trash: "<:lixo:1552009637170253894>"
};

// ==========================================
// BANCO JSON
// ==========================================

function createDefaultDatabase() {
  return {
    version: 1,
    global: {
      owners: OWNER_IDS
    },
    guilds: {}
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      const initial = createDefaultDatabase();

      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify(initial, null, 2)
      );

      return initial;
    }

    const raw = fs.readFileSync(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed.guilds) parsed.guilds = {};
    if (!parsed.global) parsed.global = {};

    if (!parsed.global.owners) {
      parsed.global.owners = OWNER_IDS;
    }

    return parsed;
  } catch (error) {
    console.error(
      "[CEMETERY] Erro ao carregar data.json:",
      error
    );

    return createDefaultDatabase();
  }
}

let database = loadData();

function saveData() {
  try {
    const temporaryPath = `${DATA_PATH}.tmp`;

    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(database, null, 2)
    );

    fs.renameSync(temporaryPath, DATA_PATH);
  } catch (error) {
    console.error(
      "[CEMETERY] Erro ao salvar dados:",
      error
    );
  }
}

// ==========================================
// CONFIGURAÇÃO DE CADA SERVIDOR
// ==========================================

function createDefaultGuild() {
  return {
    enabled: false,
    channelId: null,

    cooldown: DEFAULT_COOLDOWN,
    processingDelay: DEFAULT_PROCESSING_DELAY,
    maxMediaSize: MAX_MEDIA_SIZE,

    commentsEnabled: true,
    likesEnabled: true,
    approval: false,

    allowImages: true,
    allowVideos: true,
    allowMultipleMedia: true,

    maxMediaPerPost: 10,
    deleteOriginalMessage: true,
    notifyAuthor: true,
    socialLinksEnabled: true,

    posts: {},
    profiles: {},
    pendingPosts: {},
    cooldowns: {},

    emojis: { ...EMOJIS },

    statistics: {
      posts: 0,
      likes: 0,
      comments: 0,
      deletedPosts: 0
    }
  };
}

function getGuild(guildId) {
  if (!database.guilds[guildId]) {
    database.guilds[guildId] = createDefaultGuild();
    saveData();
  }

  const current = database.guilds[guildId];
  const defaults = createDefaultGuild();

  for (const [key, value] of Object.entries(defaults)) {
    if (current[key] === undefined) {
      current[key] = value;
    }
  }

  current.emojis = {
    ...EMOJIS,
    ...(current.emojis || {})
  };

  current.statistics = {
    ...defaults.statistics,
    ...(current.statistics || {})
  };

  return current;
}

// ==========================================
// PERFIS
// ==========================================

function getProfile(guildId, userId) {
  const guild = getGuild(guildId);

  if (!guild.profiles[userId]) {
    guild.profiles[userId] = {
      userId,
      instagram: null,
      tiktok: null,
      website: null,
      otherLinks: [],
      createdAt: Date.now()
    };

    saveData();
  }

  return guild.profiles[userId];
}

// ==========================================
// PUBLICAÇÕES
// ==========================================

function makePostId() {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

function findPost(guildId, postId) {
  const guild = getGuild(guildId);

  return guild.posts[postId] ||
    guild.pendingPosts[postId] ||
    null;
}

function isPostAuthor(post, userId) {
  return Boolean(post && post.authorId === userId);
}

function isOwner(userId) {
  return OWNER_IDS.includes(userId);
}

// ==========================================
// COMPONENTS V2
// ==========================================

function makePanel(title, description) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${title}\n${description}`
    )
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

function makePrivatePanel(title, description) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${title}\n${description}`
    )
  );

  return {
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral
  };
}

function makeButton(
  customId,
  label,
  style = ButtonStyle.Secondary,
  emoji = null
) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);

  if (emoji) button.setEmoji(emoji);

  return button;
}

// ==========================================
// COMANDOS
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configurar o Cemetery neste servidor"),

  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Consultar seu perfil do Cemetery"),

  new SlashCommandBuilder()
    .setName("publicacoes")
    .setDescription("Consultar suas publicações")
];

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID) {
    console.error(
      "[CEMETERY] Configure DISCORD_TOKEN e CLIENT_ID nas variáveis da hospedagem."
    );

    return;
  }

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      {
        body: commands.map(command => command.toJSON())
      }
    );

    console.log("[CEMETERY] Comandos registrados.");
  } catch (error) {
    console.error(
      "[CEMETERY] Erro ao registrar comandos:",
      error
    );
  }
}

// ==========================================
// CONTROLES INTERNOS
// ==========================================

const processingUsers = new Set();

const pendingMediaEdits = new Map();
const pendingCaptionEdits = new Map();
const pendingLinkEdits = new Map();
const pendingComments = new Map();

const activeInteractions = new Set();

console.log("[CEMETERY] Parte 1 carregada.");

// ==========================================
// FIM DA PARTE 1
// ==========================================
// ==========================================
// PARTE 2 - SISTEMA DE PUBLICAÇÕES
// ==========================================

// ==========================================
// DETECTAR FOTOS E VÍDEOS
// ==========================================

function isImage(attachment) {
  const type = attachment.contentType || "";

  return (
    type.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|avif)$/i.test(attachment.name || "")
  );
}

function isVideo(attachment) {
  const type = attachment.contentType || "";

  return (
    type.startsWith("video/") ||
    /\.(mp4|mov|webm|m4v)$/i.test(attachment.name || "")
  );
}

function getMedia(message, settings) {
  const attachments = [...message.attachments.values()];

  const media = attachments.filter(attachment => {
    if (isImage(attachment) && settings.allowImages) return true;
    if (isVideo(attachment) && settings.allowVideos) return true;

    return false;
  });

  return media.slice(
    0,
    settings.allowMultipleMedia ? settings.maxMediaPerPost : 1
  );
}

// ==========================================
// BAIXAR MÍDIA
// ==========================================

async function downloadMedia(attachment, settings) {
  if (attachment.size > settings.maxMediaSize) {
    throw new Error("MEDIA_TOO_LARGE");
  }

  const response = await fetch(attachment.url);

  if (!response.ok) {
    throw new Error("MEDIA_DOWNLOAD_FAILED");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > settings.maxMediaSize) {
    throw new Error("MEDIA_TOO_LARGE");
  }

  return {
    buffer,
    name: attachment.name || "cemetery-media",
    contentType: attachment.contentType || "application/octet-stream",
    type: isVideo(attachment) ? "video" : "image"
  };
}

// ==========================================
// CRIAR OBJETO DA PUBLICAÇÃO
// ==========================================

function createPostObject(message, media) {
  const settings = getGuild(message.guild.id);

  return {
    id: makePostId(),

    guildId: message.guild.id,

    authorId: message.author.id,
    authorTag: message.author.tag,

    caption: message.content.slice(0, MAX_CAPTION_LENGTH),

    media: media.map(item => ({
      name: item.name,
      type: item.type,
      url: null
    })),

    messageId: null,
    mediaMessageId: null,

    channelId: settings.channelId,

    createdAt: Date.now(),
    publishedAt: null,

    likes: [],
    comments: [],

    approved: true
  };
}

// ==========================================
// COMPONENTES DA PUBLICAÇÃO
// ==========================================

function postComponents(post, settings) {
  const container = new ContainerBuilder();

  // MENÇÃO REAL DO AUTOR
  let content =
    `## Publicação de <@${post.authorId}>\n`;

  if (post.caption) {
    content += `\n${post.caption}\n`;
  }

  content +=
    `\n${settings.emojis.like} **${post.likes.length}** curtidas` +
    `  ${settings.emojis.comment} **${post.comments.length}** comentários`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(content)
  );

  // GALERIA DE FOTOS
  const images = post.media.filter(
    item => item.type === "image" && item.url
  );

  if (images.length) {
    const gallery = new MediaGalleryBuilder();

    for (const item of images.slice(0, 10)) {
      gallery.addItems(
        new MediaGalleryItemBuilder().setURL(item.url)
      );
    }

    container.addMediaGalleryComponents(gallery);
  }

  // VÍDEOS
  const videos = post.media.filter(
    item => item.type === "video" && item.url
  );

  if (videos.length) {
    const videoText = videos
      .map((item, index) =>
        `[Assistir vídeo ${index + 1}](${item.url})`
      )
      .join("\n");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(videoText)
    );
  }

  // BOTÕES
  const buttons = [];

  if (settings.likesEnabled) {
    buttons.push(
      makeButton(
        `cem_like:${post.guildId}:${post.id}`,
        "Curtir",
        ButtonStyle.Secondary,
        settings.emojis.like
      )
    );
  }

  if (settings.commentsEnabled) {
    buttons.push(
      makeButton(
        `cem_comment:${post.guildId}:${post.id}`,
        "Comentar",
        ButtonStyle.Secondary,
        settings.emojis.comment
      )
    );
  }

  buttons.push(
    makeButton(
      `cem_profile:${post.guildId}:${post.authorId}`,
      "Perfil",
      ButtonStyle.Secondary
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(buttons)
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}

// ==========================================
// PUBLICAR NO CANAL
// ==========================================

async function publishPost(guild, post, mediaFiles) {
  const settings = getGuild(guild.id);

  if (!settings.channelId) {
    throw new Error("CHANNEL_NOT_CONFIGURED");
  }

  const channel = await guild.channels.fetch(settings.channelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error("INVALID_CHANNEL");
  }

  // Enviar arquivos para o Discord
  const files = mediaFiles.map(item =>
    new AttachmentBuilder(item.buffer, {
      name: item.name
    })
  );

  const mediaMessage = await channel.send({
    files,
    allowedMentions: {
      parse: []
    }
  });

  const uploaded = [...mediaMessage.attachments.values()];

  if (uploaded.length !== mediaFiles.length) {
    await mediaMessage.delete().catch(() => {});
    throw new Error("MEDIA_UPLOAD_FAILED");
  }

  // Guardar URLs reais dos arquivos
  post.media = mediaFiles.map((item, index) => ({
    name: item.name,
    type: item.type,
    url: uploaded[index].url
  }));

  post.mediaMessageId = mediaMessage.id;

  // Publicação com menção real ao autor
  const published = await channel.send({
    ...postComponents(post, settings),

    allowedMentions: {
      users: [post.authorId],
      roles: [],
      parse: []
    }
  });

  post.messageId = published.id;
  post.publishedAt = Date.now();

  settings.posts[post.id] = post;
  settings.statistics.posts++;

  saveData();

  return published;
}

// ==========================================
// ATUALIZAR PUBLICAÇÃO
// ==========================================

async function refreshPost(guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post || !post.messageId || !post.channelId) {
    return false;
  }

  try {
    const guild = await client.guilds.fetch(guildId);

    const channel = await guild.channels.fetch(
      post.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(
      post.messageId
    );

    await message.edit({
      ...postComponents(post, settings),

      allowedMentions: {
        users: [post.authorId],
        roles: [],
        parse: []
      }
    });

    return true;
  } catch (error) {
    console.error(
      "[CEMETERY] Erro ao atualizar publicação:",
      error
    );

    return false;
  }
}

// ==========================================
// CRIAR PUBLICAÇÃO
// ==========================================

async function createPost(message) {
  if (!message.guild || message.author.bot) return;

  const settings = getGuild(message.guild.id);

  if (!settings.enabled) return;
  if (!settings.channelId) return;

  if (message.channel.id !== settings.channelId) return;

  const media = getMedia(message, settings);

  if (!media.length) return;

  const now = Date.now();

  const lastPost =
    settings.cooldowns[message.author.id] || 0;

  const remaining =
    settings.cooldown -
    Math.floor((now - lastPost) / 1000);

  if (remaining > 0) {
    await message.reply(
      makePanel(
        "AGUARDE UM POUCO",
        `Você poderá publicar novamente em **${remaining} segundos**.`
      )
    ).catch(() => {});

    return;
  }

  if (processingUsers.has(message.author.id)) return;

  processingUsers.add(message.author.id);

  try {
    await message.reply(
      makePanel(
        "PROCESSANDO PUBLICAÇÃO",
        `${settings.emojis.loading} Estamos preparando sua mídia. Aguarde um instante.`
      )
    ).catch(() => {});

    await new Promise(resolve =>
      setTimeout(resolve, settings.processingDelay)
    );

    const freshMessage = await message.channel.messages
      .fetch(message.id)
      .catch(() => null);

    if (!freshMessage) {
      throw new Error("ORIGINAL_MESSAGE_NOT_FOUND");
    }

    const freshMedia = getMedia(freshMessage, settings);

    if (!freshMedia.length) {
      throw new Error("MEDIA_NOT_FOUND");
    }

    const downloaded = [];

    for (const attachment of freshMedia) {
      downloaded.push(
        await downloadMedia(attachment, settings)
      );
    }

    const post = createPostObject(
      freshMessage,
      downloaded
    );

    // APROVAÇÃO
    if (settings.approval) {
      settings.pendingPosts[post.id] = {
        ...post,

        mediaBuffers: downloaded.map(item => ({
          name: item.name,
          type: item.type,
          contentType: item.contentType,
          buffer: item.buffer.toString("base64")
        }))
      };

      saveData();

      if (settings.deleteOriginalMessage) {
        await freshMessage.delete().catch(() => {});
      }

      await freshMessage.author.send(
        makePanel(
          "PUBLICAÇÃO AGUARDANDO APROVAÇÃO",
          "Sua publicação foi recebida e está aguardando análise da equipe."
        )
      ).catch(() => {});

      return;
    }

    // PUBLICAÇÃO NORMAL
    await publishPost(
      message.guild,
      post,
      downloaded
    );

    settings.cooldowns[message.author.id] = Date.now();

    saveData();

    if (settings.deleteOriginalMessage) {
      await freshMessage.delete().catch(() => {});
    }

    if (settings.notifyAuthor) {
      await freshMessage.author.send(
        makePanel(
          "PUBLICAÇÃO REALIZADA",
          "Sua publicação foi enviada com sucesso."
        )
      ).catch(() => {});
    }

  } catch (error) {
    console.error(
      "[CEMETERY] Erro ao criar publicação:",
      error
    );

    await message.author.send(
      makePanel(
        "NÃO FOI POSSÍVEL PUBLICAR",
        "Ocorreu um erro ao processar sua mídia. Sua publicação não foi concluída."
      )
    ).catch(() => {});

  } finally {
    processingUsers.delete(message.author.id);
  }
}

// ==========================================
// SISTEMA DE CURTIDAS
// ==========================================

async function toggleLike(interaction, guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post) {
    return interaction.reply(
      makePrivatePanel(
        "PUBLICAÇÃO NÃO ENCONTRADA",
        "Essa publicação não existe mais."
      )
    );
  }

  if (!settings.likesEnabled) {
    return interaction.reply(
      makePrivatePanel(
        "CURTIDAS DESATIVADAS",
        "O servidor desativou as curtidas."
      )
    );
  }

  const userId = interaction.user.id;

  const index = post.likes.indexOf(userId);

  if (index >= 0) {
    post.likes.splice(index, 1);
  } else {
    post.likes.push(userId);
    settings.statistics.likes++;
  }

  saveData();

  await interaction.deferUpdate();

  await refreshPost(guildId, postId);
}

// ==========================================
// SISTEMA DE COMENTÁRIOS
// ==========================================

function commentModal(guildId, postId) {
  const modal = new ModalBuilder()
    .setCustomId(
      `cem_submit_comment:${guildId}:${postId}`
    )
    .setTitle("Adicionar comentário");

  const input = new TextInputBuilder()
    .setCustomId("comment")
    .setLabel("Seu comentário")
    .setPlaceholder("Escreva seu comentário...")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

async function submitComment(
  interaction,
  guildId,
  postId
) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post) {
    return interaction.reply(
      makePrivatePanel(
        "PUBLICAÇÃO NÃO ENCONTRADA",
        "Essa publicação não existe mais."
      )
    );
  }

  if (!settings.commentsEnabled) {
    return interaction.reply(
      makePrivatePanel(
        "COMENTÁRIOS DESATIVADOS",
        "O servidor desativou os comentários."
      )
    );
  }

  const content = interaction.fields
    .getTextInputValue("comment")
    .trim();

  if (!content) {
    return interaction.reply(
      makePrivatePanel(
        "COMENTÁRIO VAZIO",
        "Escreva algo antes de enviar."
      )
    );
  }

  post.comments.push({
    id: makePostId(),
    authorId: interaction.user.id,
    authorTag: interaction.user.tag,
    content,
    createdAt: Date.now()
  });

  settings.statistics.comments++;

  saveData();

  await interaction.reply(
    makePrivatePanel(
      "COMENTÁRIO ENVIADO",
      "Seu comentário foi publicado."
    )
  );

  await refreshPost(guildId, postId);
}

// ==========================================
// EVENTO DE MENSAGENS
// ==========================================

client.on("messageCreate", async message => {
  try {
    if (!message.guild) return;

    await createPost(message);
  } catch (error) {
    console.error(
      "[CEMETERY] Erro no evento de mensagens:",
      error
    );
  }
});

// ==========================================
// FIM DA PARTE 2
// ==========================================
// ==========================================
// PARTE 3 - PERFIS E GERENCIAMENTO
// ==========================================

// Validar links sociais
function normalizeSocialLink(value) {
  if (!value || !value.trim()) return null;

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    url = new URL(`https://${value.trim()}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("INVALID_SOCIAL_LINK");
  }

  return url.toString();
}

// ==========================================
// MODAL DE PERFIL
// ==========================================

function profileModal(guildId) {
  const modal = new ModalBuilder()
    .setCustomId(`cem_profile_save:${guildId}`)
    .setTitle("Editar perfil");

  const instagram = new TextInputBuilder()
    .setCustomId("instagram")
    .setLabel("Link do Instagram")
    .setPlaceholder("https://instagram.com/seuusuario")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const tiktok = new TextInputBuilder()
    .setCustomId("tiktok")
    .setLabel("Link do TikTok")
    .setPlaceholder("https://tiktok.com/@seuusuario")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  const website = new TextInputBuilder()
    .setCustomId("website")
    .setLabel("Site ou outro link")
    .setPlaceholder("https://seusite.com")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(200);

  modal.addComponents(
    new ActionRowBuilder().addComponents(instagram),
    new ActionRowBuilder().addComponents(tiktok),
    new ActionRowBuilder().addComponents(website)
  );

  return modal;
}

// ==========================================
// MOSTRAR PERFIL
// ==========================================

async function showProfile(interaction, guildId, userId) {
  const settings = getGuild(guildId);
  const profile = getProfile(guildId, userId);

  const member = await interaction.guild?.members
    .fetch(userId)
    .catch(() => null);

  const username = member
    ? member.user.username
    : `<@${userId}>`;

  let description =
    `**Membro:** <@${userId}>\n` +
    `**Publicações:** ${
      Object.values(settings.posts)
        .filter(post => post.authorId === userId).length
    }\n\n`;

  if (profile.instagram) {
    description += `${settings.emojis.instagram} [Instagram](${profile.instagram})\n`;
  }

  if (profile.tiktok) {
    description += `${settings.emojis.tiktok} [TikTok](${profile.tiktok})\n`;
  }

  if (profile.website) {
    description += `${settings.emojis.link} [Site](${profile.website})\n`;
  }

  if (
    !profile.instagram &&
    !profile.tiktok &&
    !profile.website
  ) {
    description += "Nenhum link social cadastrado.";
  }

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Perfil de ${username}\n${description}`
    )
  );

  const components = [container];

  if (interaction.user.id === userId) {
    components.push(
      new ActionRowBuilder().addComponents(
        makeButton(
          `cem_profile_edit:${guildId}`,
          "Editar meu perfil"
        )
      )
    );
  }

  return interaction.reply({
    components,
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral
  });
}

// ==========================================
// MOSTRAR COMENTÁRIOS
// ==========================================

async function showComments(interaction, guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post) {
    return interaction.reply(
      makePrivatePanel(
        "PUBLICAÇÃO NÃO ENCONTRADA",
        "Essa publicação não existe mais."
      )
    );
  }

  const container = new ContainerBuilder();

  let text = `## Comentários da publicação\n`;

  if (!post.comments.length) {
    text += "\nAinda não existem comentários.";
  } else {
    text += "\n";

    for (const comment of post.comments.slice(-15)) {
      text +=
        `\n**<@${comment.authorId}>**\n` +
        `${comment.content}\n`;
    }
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(text)
  );

  return interaction.reply({
    components: [container],
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral,
    allowedMentions: {
      parse: []
    }
  });
}

// ==========================================
// SALVAR PERFIL
// ==========================================

async function saveProfile(interaction, guildId) {
  try {
    const profile = getProfile(
      guildId,
      interaction.user.id
    );

    profile.instagram = normalizeSocialLink(
      interaction.fields.getTextInputValue("instagram")
    );

    profile.tiktok = normalizeSocialLink(
      interaction.fields.getTextInputValue("tiktok")
    );

    profile.website = normalizeSocialLink(
      interaction.fields.getTextInputValue("website")
    );

    saveData();

    return interaction.reply(
      makePrivatePanel(
        "PERFIL ATUALIZADO",
        "Seus links sociais foram salvos."
      )
    );
  } catch {
    return interaction.reply(
      makePrivatePanel(
        "LINK INVÁLIDO",
        "Confira os links informados e tente novamente."
      )
    );
  }
}

// ==========================================
// MODAL PARA EDITAR LEGENDA
// ==========================================

function captionModal(guildId, postId, currentCaption) {
  const modal = new ModalBuilder()
    .setCustomId(`cem_caption_save:${guildId}:${postId}`)
    .setTitle("Editar publicação");

  const input = new TextInputBuilder()
    .setCustomId("caption")
    .setLabel("Nova legenda")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(MAX_CAPTION_LENGTH)
    .setRequired(false);

  if (currentCaption) {
    input.setValue(currentCaption.slice(0, MAX_CAPTION_LENGTH));
  }

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

// ==========================================
// SALVAR LEGENDA
// ==========================================

async function saveCaption(interaction, guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post) {
    return interaction.reply(
      makePrivatePanel(
        "PUBLICAÇÃO NÃO ENCONTRADA",
        "Essa publicação não existe mais."
      )
    );
  }

  if (!isPostAuthor(post, interaction.user.id)) {
    return interaction.reply(
      makePrivatePanel(
        "SEM PERMISSÃO",
        "Somente o autor pode editar esta publicação."
      )
    );
  }

  post.caption = interaction.fields
    .getTextInputValue("caption")
    .slice(0, MAX_CAPTION_LENGTH);

  saveData();

  await interaction.reply(
    makePrivatePanel(
      "LEGENDA ATUALIZADA",
      "Sua publicação foi atualizada."
    )
  );

  await refreshPost(guildId, postId);
}

// ==========================================
// EXCLUIR PUBLICAÇÃO
// ==========================================

async function deletePost(interaction, guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post) {
    return interaction.reply(
      makePrivatePanel(
        "PUBLICAÇÃO NÃO ENCONTRADA",
        "Essa publicação não existe mais."
      )
    );
  }

  if (!isPostAuthor(post, interaction.user.id)) {
    return interaction.reply(
      makePrivatePanel(
        "SEM PERMISSÃO",
        "Somente o autor pode excluir esta publicação."
      )
    );
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral
  });

  try {
    const guild = await client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(post.channelId);

    if (channel && channel.isTextBased()) {
      if (post.messageId) {
        const published = await channel.messages
          .fetch(post.messageId)
          .catch(() => null);

        if (published) {
          await published.delete().catch(() => {});
        }
      }

      if (post.mediaMessageId) {
        const mediaMessage = await channel.messages
          .fetch(post.mediaMessageId)
          .catch(() => null);

        if (mediaMessage) {
          await mediaMessage.delete().catch(() => {});
        }
      }
    }

    delete settings.posts[postId];

    settings.statistics.deletedPosts++;

    saveData();

    return interaction.editReply(
      makePrivatePanel(
        "PUBLICAÇÃO EXCLUÍDA",
        "Sua publicação foi removida."
      )
    );
  } catch (error) {
    console.error("[CEMETERY] Erro ao excluir publicação:", error);

    return interaction.editReply(
      makePrivatePanel(
        "ERRO",
        "Não foi possível excluir a publicação."
      )
    );
  }
}

// ==========================================
// PAINEL DE GERENCIAMENTO DAS PUBLICAÇÕES
// ==========================================

async function showMyPosts(interaction) {
  const settings = getGuild(interaction.guildId);

  const posts = Object.values(settings.posts)
    .filter(post => post.authorId === interaction.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 25);

  if (!posts.length) {
    return interaction.reply(
      makePrivatePanel(
        "SUAS PUBLICAÇÕES",
        "Você ainda não possui publicações."
      )
    );
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(`cem_manage_select:${interaction.guildId}`)
    .setPlaceholder("Selecione uma publicação");

  for (const post of posts) {
    select.addOptions({
      label: `Publicação ${post.id.slice(0, 12)}`,
      description: post.caption
        ? post.caption.slice(0, 90)
        : "Sem legenda",
      value: post.id
    });
  }

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Suas publicações\n` +
      `Você possui **${posts.length}** publicação(ões) nesta lista.`
    )
  );

  return interaction.reply({
    components: [
      container,
      new ActionRowBuilder().addComponents(select)
    ],
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral
  });
}

// ==========================================
// MENU DE AÇÕES DE UMA PUBLICAÇÃO
// ==========================================

async function showPostManagement(interaction, guildId, postId) {
  const settings = getGuild(guildId);
  const post = settings.posts[postId];

  if (!post || post.authorId !== interaction.user.id) {
    return interaction.reply(
      makePrivatePanel(
        "SEM PERMISSÃO",
        "Essa publicação não está disponível para você."
      )
    );
  }

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Gerenciar publicação\n` +
      `Publicação: \`${post.id}\`\n` +
      `Curtidas: **${post.likes.length}**\n` +
      `Comentários: **${post.comments.length}**`
    )
  );

  const row = new ActionRowBuilder().addComponents(
    makeButton(
      `cem_edit_caption:${guildId}:${postId}`,
      "Editar legenda"
    ),
    makeButton(
      `cem_show_comments:${guildId}:${postId}`,
      "Comentários"
    ),
    makeButton(
      `cem_delete_post:${guildId}:${postId}`,
      "Excluir publicação"
    )
  );

  return interaction.reply({
    components: [container, row],
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral
  });
}

console.log("[CEMETERY] Parte 3 carregada.");

// ==========================================
// FIM DA PARTE 3
// ==========================================
// ==========================================
// PARTE 4 - CONFIGURAÇÃO DO CEMETERY
// ==========================================

function canConfigure(interaction) {
  return (
    isOwner(interaction.user.id) ||
    interaction.memberPermissions?.has("Administrator")
  );
}

// ==========================================
// PAINEL PRINCIPAL
// ==========================================

function configPanel(guildId) {
  const settings = getGuild(guildId);

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## CEMETERY — CONFIGURAÇÕES\n` +
      `Gerencie o sistema de publicações deste servidor.\n\n` +
      `**Sistema:** ${settings.enabled ? "Ativado" : "Desativado"}\n` +
      `**Canal:** ${settings.channelId ? `<#${settings.channelId}>` : "Não configurado"}\n` +
      `**Intervalo:** ${settings.cooldown} segundos\n` +
      `**Processamento:** ${settings.processingDelay / 1000} segundos\n` +
      `**Curtidas:** ${settings.likesEnabled ? "Ativadas" : "Desativadas"}\n` +
      `**Comentários:** ${settings.commentsEnabled ? "Ativados" : "Desativados"}\n` +
      `**Fotos:** ${settings.allowImages ? "Permitidas" : "Bloqueadas"}\n` +
      `**Vídeos:** ${settings.allowVideos ? "Permitidos" : "Bloqueados"}\n` +
      `**Múltiplas mídias:** ${settings.allowMultipleMedia ? "Ativadas" : "Desativadas"}\n` +
      `**Excluir mensagem original:** ${settings.deleteOriginalMessage ? "Sim" : "Não"}\n` +
      `**Avisar autor:** ${settings.notifyAuthor ? "Sim" : "Não"}`
    )
  );

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`cem_cfg_channel:${guildId}`)
    .setPlaceholder("Selecionar canal de publicações")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);

  const firstRow = new ActionRowBuilder()
    .addComponents(channelSelect);

  const secondRow = new ActionRowBuilder().addComponents(
    makeButton(
      `cem_cfg_toggle:${guildId}:enabled`,
      settings.enabled ? "Desativar sistema" : "Ativar sistema"
    ),
    makeButton(
      `cem_cfg_toggle:${guildId}:likesEnabled`,
      `Curtidas: ${settings.likesEnabled ? "ON" : "OFF"}`
    ),
    makeButton(
      `cem_cfg_toggle:${guildId}:commentsEnabled`,
      `Comentários: ${settings.commentsEnabled ? "ON" : "OFF"}`
    )
  );

  const thirdRow = new ActionRowBuilder().addComponents(
    makeButton(
      `cem_cfg_toggle:${guildId}:allowImages`,
      `Fotos: ${settings.allowImages ? "ON" : "OFF"}`
    ),
    makeButton(
      `cem_cfg_toggle:${guildId}:allowVideos`,
      `Vídeos: ${settings.allowVideos ? "ON" : "OFF"}`
    ),
    makeButton(
      `cem_cfg_toggle:${guildId}:allowMultipleMedia`,
      `Múltiplas: ${settings.allowMultipleMedia ? "ON" : "OFF"}`
    )
  );

  const fourthRow = new ActionRowBuilder().addComponents(
    makeButton(
      `cem_cfg_toggle:${guildId}:deleteOriginalMessage`,
      `Excluir original: ${settings.deleteOriginalMessage ? "ON" : "OFF"}`
    ),
    makeButton(
      `cem_cfg_toggle:${guildId}:notifyAuthor`,
      `Avisos: ${settings.notifyAuthor ? "ON" : "OFF"}`
    ),
    makeButton(
      `cem_cfg_timers:${guildId}`,
      "Tempos"
    )
  );

  const fifthRow = new ActionRowBuilder().addComponents(
    makeButton(
      `cem_cfg_refresh:${guildId}`,
      "Atualizar painel"
    )
  );

  return {
    components: [
      container,
      firstRow,
      secondRow,
      thirdRow,
      fourthRow,
      fifthRow
    ],
    flags:
      MessageFlags.IsComponentsV2 |
      MessageFlags.Ephemeral
  };
}

// ==========================================
// MODAL DOS TEMPOS
// ==========================================

function timersModal(guildId) {
  const settings = getGuild(guildId);

  const modal = new ModalBuilder()
    .setCustomId(`cem_cfg_save_timers:${guildId}`)
    .setTitle("Tempos do Cemetery");

  const cooldown = new TextInputBuilder()
    .setCustomId("cooldown")
    .setLabel("Intervalo entre publicações (segundos)")
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.cooldown))
    .setRequired(true)
    .setMaxLength(6);

  const delay = new TextInputBuilder()
    .setCustomId("delay")
    .setLabel("Tempo de processamento (segundos)")
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.processingDelay / 1000))
    .setRequired(true)
    .setMaxLength(4);

  const maxMedia = new TextInputBuilder()
    .setCustomId("maxMedia")
    .setLabel("Máximo de mídias por publicação (1 a 10)")
    .setStyle(TextInputStyle.Short)
    .setValue(String(settings.maxMediaPerPost))
    .setRequired(true)
    .setMaxLength(2);

  modal.addComponents(
    new ActionRowBuilder().addComponents(cooldown),
    new ActionRowBuilder().addComponents(delay),
    new ActionRowBuilder().addComponents(maxMedia)
  );

  return modal;
}

// ==========================================
// TRATAR CONFIGURAÇÕES
// ==========================================

async function handleConfigButton(interaction, guildId, operation, value) {
  if (!canConfigure(interaction)) {
    return interaction.reply(
      makePrivatePanel(
        "SEM PERMISSÃO",
        "Somente administradores do servidor podem configurar o Cemetery."
      )
    );
  }

  const settings = getGuild(guildId);

  if (operation === "refresh") {
    return interaction.update(configPanel(guildId));
  }

  if (operation === "timers") {
    return interaction.showModal(timersModal(guildId));
  }

  if (operation === "toggle") {
    const allowed = [
      "enabled",
      "likesEnabled",
      "commentsEnabled",
      "allowImages",
      "allowVideos",
      "allowMultipleMedia",
      "deleteOriginalMessage",
      "notifyAuthor"
    ];

    if (!allowed.includes(value)) {
      return interaction.reply(
        makePrivatePanel("OPÇÃO INVÁLIDA", "Essa configuração não existe.")
      );
    }

    settings[value] = !settings[value];

    saveData();

    return interaction.update(configPanel(guildId));
  }
}

// ==========================================
// EVENTO PRINCIPAL DE INTERAÇÕES
// ==========================================

client.on("interactionCreate", async interaction => {
  try {
    // --------------------------------------
    // COMANDOS
    // --------------------------------------

    if (interaction.isChatInputCommand()) {
      if (!interaction.guildId) {
        return interaction.reply(
          makePrivatePanel(
            "USE EM UM SERVIDOR",
            "Este comando precisa ser utilizado dentro de um servidor."
          )
        );
      }

      if (interaction.commandName === "config") {
        if (!canConfigure(interaction)) {
          return interaction.reply(
            makePrivatePanel(
              "SEM PERMISSÃO",
              "Você precisa ser administrador do servidor."
            )
          );
        }

        getGuild(interaction.guildId);

        return interaction.reply(
          configPanel(interaction.guildId)
        );
      }

      if (interaction.commandName === "perfil") {
        return showProfile(
          interaction,
          interaction.guildId,
          interaction.user.id
        );
      }

      if (interaction.commandName === "publicacoes") {
        return showMyPosts(interaction);
      }
    }

    // --------------------------------------
    // BOTÕES
    // --------------------------------------

    if (interaction.isButton()) {
      const parts = interaction.customId.split(":");
      const action = parts[0];

      if (action === "cem_like") {
        return toggleLike(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_comment") {
        const post = getGuild(parts[1]).posts[parts[2]];

        if (!post) {
          return interaction.reply(
            makePrivatePanel("PUBLICAÇÃO NÃO ENCONTRADA", "Ela não existe mais.")
          );
        }

        return interaction.showModal(
          commentModal(parts[1], parts[2])
        );
      }

      if (action === "cem_profile") {
        return showProfile(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_profile_edit") {
        return interaction.showModal(
          profileModal(parts[1])
        );
      }

      if (action === "cem_edit_caption") {
        const settings = getGuild(parts[1]);
        const post = settings.posts[parts[2]];

        if (!post || post.authorId !== interaction.user.id) {
          return interaction.reply(
            makePrivatePanel("SEM PERMISSÃO", "Somente o autor pode editar.")
          );
        }

        return interaction.showModal(
          captionModal(parts[1], parts[2], post.caption)
        );
      }

      if (action === "cem_show_comments") {
        return showComments(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_delete_post") {
        return deletePost(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_cfg_toggle") {
        return handleConfigButton(
          interaction,
          parts[1],
          "toggle",
          parts[2]
        );
      }

      if (action === "cem_cfg_refresh") {
        return handleConfigButton(
          interaction,
          parts[1],
          "refresh"
        );
      }

      if (action === "cem_cfg_timers") {
        return handleConfigButton(
          interaction,
          parts[1],
          "timers"
        );
      }
    }

    // --------------------------------------
    // SELETORES DE CANAL
    // --------------------------------------

    if (interaction.isChannelSelectMenu()) {
      const parts = interaction.customId.split(":");

      if (parts[0] === "cem_cfg_channel") {
        const guildId = parts[1];

        if (
          interaction.guildId !== guildId ||
          !canConfigure(interaction)
        ) {
          return interaction.reply(
            makePrivatePanel("SEM PERMISSÃO", "Não autorizado.")
          );
        }

        const settings = getGuild(guildId);

        settings.channelId = interaction.values[0];

        saveData();

        return interaction.update(
          configPanel(guildId)
        );
      }
    }

    // --------------------------------------
    // SELETORES DE PUBLICAÇÕES
    // --------------------------------------

    if (interaction.isStringSelectMenu()) {
      const parts = interaction.customId.split(":");

      if (parts[0] === "cem_manage_select") {
        const guildId = parts[1];
        const postId = interaction.values[0];

        return showPostManagement(
          interaction,
          guildId,
          postId
        );
      }
    }

    // --------------------------------------
    // MODAIS
    // --------------------------------------

    if (interaction.isModalSubmit()) {
      const parts = interaction.customId.split(":");
      const action = parts[0];

      if (action === "cem_submit_comment") {
        return submitComment(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_profile_save") {
        return saveProfile(
          interaction,
          parts[1]
        );
      }

      if (action === "cem_caption_save") {
        return saveCaption(
          interaction,
          parts[1],
          parts[2]
        );
      }

      if (action === "cem_cfg_save_timers") {
        const guildId = parts[1];

        if (
          interaction.guildId !== guildId ||
          !canConfigure(interaction)
        ) {
          return interaction.reply(
            makePrivatePanel("SEM PERMISSÃO", "Não autorizado.")
          );
        }

        const cooldown = Number(
          interaction.fields.getTextInputValue("cooldown")
        );

        const delay = Number(
          interaction.fields.getTextInputValue("delay")
        );

        const maxMedia = Number(
          interaction.fields.getTextInputValue("maxMedia")
        );

        if (
          !Number.isInteger(cooldown) ||
          cooldown < 0 ||
          cooldown > 86400 ||
          !Number.isInteger(delay) ||
          delay < 1 ||
          delay > 60 ||
          !Number.isInteger(maxMedia) ||
          maxMedia < 1 ||
          maxMedia > 10
        ) {
          return interaction.reply(
            makePrivatePanel(
              "VALORES INVÁLIDOS",
              "Confira os limites: intervalo de 0 a 86400 segundos, processamento de 1 a 60 segundos e mídias de 1 a 10."
            )
          );
        }

        const settings = getGuild(guildId);

        settings.cooldown = cooldown;
        settings.processingDelay = delay * 1000;
        settings.maxMediaPerPost = maxMedia;

        saveData();

        return interaction.reply(
          makePrivatePanel(
            "CONFIGURAÇÕES SALVAS",
            "Os tempos e limites foram atualizados."
          )
        );
      }
    }

  } catch (error) {
    console.error(
      "[CEMETERY] Erro em interação:",
      error
    );

    const response = makePrivatePanel(
      "ERRO",
      "Não foi possível concluir essa ação. Tente novamente."
    );

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================

client.once("ready", async () => {
  console.log(
    `[CEMETERY] Online como ${client.user.tag}`
  );

  await registerCommands();
});

if (!TOKEN) {
  console.error("[CEMETERY] DISCORD_TOKEN não configurado.");
} else {
  client.login(TOKEN).catch(error => {
    console.error("[CEMETERY] Falha ao conectar:", error);
  });
}

// ==========================================
// FIM DO CEMETERY
// ==========================================
