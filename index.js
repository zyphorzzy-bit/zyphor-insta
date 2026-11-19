
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
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  ChannelSelectMenuBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

const OWNERS = [
  "1541239768010981378",
  "1533306874513068093"
];

const DATA_PATH = path.join(__dirname, "data.json");

const DEFAULT_COOLDOWN = 600;
const DEFAULT_PROCESSING_DELAY = 5000;

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
  tiktok: "<:play:1552762285502627930>"
};

// ==========================================
// BANCO JSON
// ==========================================

function loadData() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      fs.writeFileSync(
        DATA_PATH,
        JSON.stringify({
          guilds: {},
          global: { owners: OWNERS }
        }, null, 2)
      );
    }

    return JSON.parse(
      fs.readFileSync(DATA_PATH, "utf8")
    );

  } catch (error) {
    console.error("Erro ao carregar data.json:", error);

    return {
      guilds: {},
      global: { owners: OWNERS }
    };
  }
}

let database = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_PATH,
    JSON.stringify(database, null, 2)
  );
}

function isOwner(userId) {
  return OWNERS.includes(userId);
}

// ==========================================
// CONFIGURAÇÃO INDIVIDUAL POR SERVIDOR
// ==========================================

function getGuild(guildId) {
  if (!database.guilds[guildId]) {
    database.guilds[guildId] = {
      enabled: false,
      channelId: null,

      cooldown: DEFAULT_COOLDOWN,
      processingDelay: DEFAULT_PROCESSING_DELAY,

      approval: false,
      commentsEnabled: true,
      likesEnabled: true,

      posts: {},
      profiles: {},

      emojis: { ...EMOJIS }
    };

    saveData();
  }

  const data = database.guilds[guildId];

  data.emojis = {
    ...EMOJIS,
    ...(data.emojis || {})
  };

  data.posts ||= {};
  data.profiles ||= {};

  return data;
}

// ==========================================
// PERFIL DOS MEMBROS
// ==========================================

function getProfile(guildId, userId) {
  const data = getGuild(guildId);

  if (!data.profiles[userId]) {
    data.profiles[userId] = {
      instagram: null,
      tiktok: null,
      lastPostAt: 0
    };

    saveData();
  }

  return data.profiles[userId];
}

// ==========================================
// COMPONENTS V2
// ==========================================

function makePanel(title, description, components = []) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder()
        .setContent(`# ${title}\n${description}`)
    );

  for (const component of components) {
    container.addActionRowComponents(component);
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: []
    }
  };
}

function makeButton(customId, label, emoji, disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(disabled);

  if (emoji) button.setEmoji(emoji);

  return button;
}

function makeSeparator() {
  return new SeparatorBuilder();
}

// ==========================================
// COMANDO /CONFIG
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Abrir configuração do Cemetery")
];

async function registerCommands() {
  if (!CLIENT_ID || !TOKEN) {
    console.log("CLIENT_ID ou DISCORD_TOKEN não configurado.");
    return;
  }

  const rest = new REST({ version: "10" })
    .setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands.map(command => command.toJSON()) }
  );

  console.log("Comando /config registrado.");
}

// ==========================================
// IDENTIFICAÇÃO DE PUBLICAÇÕES
// ==========================================

function makePostId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findPost(guildId, postId) {
  const data = getGuild(guildId);
  return data.posts[postId] || null;
}

function isPostAuthor(post, userId) {
  return post && post.authorId === userId;
}

// ==========================================
// MÍDIA
// ==========================================

function getMedia(message) {
  const attachment = message.attachments.find(item => {
    const type = item.contentType || "";
    const name = item.name || "";

    return (
      type.startsWith("image/") ||
      type.startsWith("video/") ||
      /\.(png|jpe?g|gif|webp|mp4|mov|webm)$/i.test(name)
    );
  });

  if (!attachment) return null;

  const type = attachment.contentType || "";

  return {
    url: attachment.url,
    type: type.startsWith("video/") ||
      /\.(mp4|mov|webm)$/i.test(attachment.name || "")
      ? "video"
      : "image",
    name: attachment.name || "media"
  };
}

// ==========================================
// RESPOSTA PRIVADA
// ==========================================

async function replyPrivate(interaction, content) {
  const payload = makePanel(
    "CEMETERY",
    content
  );

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({
      ...payload,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });
  }

  return interaction.reply({
    ...payload,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  });
}

// ==========================================
// FIM DA PARTE 1
// A PARTE 2 CONTINUA DESTE PONTO
// ==========================================
// ==========================================
// PUBLICAÇÃO DE POSTS
// ==========================================

const processingUsers = new Set();

function createPostObject(message, media) {
  const data = getGuild(message.guild.id);
  const postId = makePostId();

  const post = {
    id: postId,
    guildId: message.guild.id,
    authorId: message.author.id,
    authorTag: message.author.tag,
    caption: message.content || "",
    mediaUrl: media.url,
    mediaType: media.type,
    mediaName: media.name,
    createdAt: Date.now(),
    messageId: null,
    approved: !data.approval,
    likes: [],
    comments: []
  };

  data.posts[postId] = post;
  saveData();

  return post;
}

// ==========================================
// PAINEL PÚBLICO DO POST
// ==========================================

function postComponents(post, data) {
  const container = new ContainerBuilder();

  const caption = post.caption
    ? post.caption
    : "*Sem legenda*";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Publicação de ${post.authorTag}\n${caption}\n\n` +
      `**Curtidas:** ${post.likes.length}\n` +
      `**Comentários:** ${post.comments.length}`
    )
  );

  if (post.mediaUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(post.mediaUrl)
          .setDescription("Publicação do Cemetery")
      )
    );
  }

  const buttons = [];

  if (data.likesEnabled) {
    buttons.push(
      makeButton(
        `post:like:${post.guildId}:${post.id}`,
        "Curtir",
        data.emojis.like
      )
    );
  }

  if (data.commentsEnabled) {
    buttons.push(
      makeButton(
        `post:comment:${post.guildId}:${post.id}`,
        "Comentar",
        data.emojis.comment
      )
    );
  }

  buttons.push(
    makeButton(
      `post:interactions:${post.guildId}:${post.id}`,
      "Interações",
      data.emojis.document
    )
  );

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + 5)
      )
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container, ...rows],
    allowedMentions: { parse: [] }
  };
}

// ==========================================
// PUBLICAR NO CANAL
// ==========================================

async function publishPost(guild, post) {
  const data = getGuild(guild.id);

  if (!data.channelId) {
    throw new Error("Canal de publicações não configurado.");
  }

  const channel = await guild.channels.fetch(data.channelId);

  if (!channel || !channel.isTextBased()) {
    throw new Error("Canal de publicações inválido.");
  }

  const sent = await channel.send(
    postComponents(post, data)
  );

  post.messageId = sent.id;
  post.publishedAt = Date.now();

  saveData();

  return sent;
}

// ==========================================
// ATUALIZAR PUBLICAÇÃO
// ==========================================

async function refreshPost(guildId, postId) {
  const post = findPost(guildId, postId);
  if (!post || !post.messageId) return;

  const guild = await client.guilds.fetch(guildId);
  const data = getGuild(guildId);

  const channel = await guild.channels.fetch(data.channelId);
  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(post.messageId)
    .catch(() => null);

  if (!message) return;

  await message.edit(postComponents(post, data));
}

// ==========================================
// PAINEL PRIVADO DO AUTOR
// ==========================================

async function sendMemberPanel(user, guildId, postId) {
  const post = findPost(guildId, postId);
  if (!post) return;

  const data = getGuild(guildId);

  const row1 = new ActionRowBuilder().addComponents(
    makeButton(
      `member:edit:${guildId}:${postId}`,
      "Editar legenda",
      data.emojis.document
    ),
    makeButton(
      `member:media:${guildId}:${postId}`,
      "Editar mídia",
      data.emojis.instagram
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    makeButton(
      `member:links:${guildId}:${postId}`,
      "Redes sociais",
      data.emojis.link
    ),
    makeButton(
      `member:interactions:${guildId}:${postId}`,
      "Interações",
      data.emojis.like
    ),
    makeButton(
      `member:delete:${guildId}:${postId}`,
      "Excluir",
      data.emojis.delete
    )
  );

  await user.send(
    makePanel(
      "GERENCIAR PUBLICAÇÃO",
      "Use os controles abaixo para administrar sua publicação.",
      [row1, row2]
    )
  ).catch(() => {});
}

// ==========================================
// PROCESSAR MENSAGEM DO MEMBRO
// ==========================================

async function createPost(message) {
  if (!message.guild || message.author.bot) return;

  const data = getGuild(message.guild.id);

  if (!data.enabled) return;
  if (message.channel.id !== data.channelId) return;

  const media = getMedia(message);

  if (!media) {
    await message.delete().catch(() => {});
    return;
  }

  const profile = getProfile(
    message.guild.id,
    message.author.id
  );

  const now = Date.now();
  const remaining = data.cooldown * 1000 -
    (now - profile.lastPostAt);

  if (remaining > 0) {
    await message.delete().catch(() => {});

    const seconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    try {
      const dm = await message.author.send(
        makePanel(
          "AGUARDE",
          `Você precisa esperar **${minutes}m ${rest}s** antes de fazer outra publicação.`
        )
      );

      setTimeout(() => {
        dm.delete().catch(() => {});
      }, 10000);
    } catch {}

    return;
  }

  const lock = `${message.guild.id}:${message.author.id}`;

  if (processingUsers.has(lock)) {
    await message.delete().catch(() => {});
    return;
  }

  processingUsers.add(lock);

  try {
    await new Promise(resolve =>
      setTimeout(resolve, data.processingDelay)
    );

    const refreshed = await message.channel.messages.fetch(message.id)
      .catch(() => null);

    if (!refreshed) return;

    const refreshedMedia = getMedia(refreshed);

    if (!refreshedMedia) {
      await refreshed.delete().catch(() => {});
      return;
    }

    const post = createPostObject(
      refreshed,
      refreshedMedia
    );

    await refreshed.delete().catch(() => {});

    if (data.approval) {
      await message.author.send(
        makePanel(
          "PUBLICAÇÃO PENDENTE",
          "Sua publicação foi recebida e está aguardando aprovação."
        )
      ).catch(() => {});

      // A aprovação será tratada pelo painel administrativo.
      return;
    }

    try {
      await publishPost(message.guild, post);

      profile.lastPostAt = Date.now();
      saveData();

      await sendMemberPanel(
        message.author,
        message.guild.id,
        post.id
      );

    } catch (error) {
      console.error("Erro ao publicar:", error);

      delete data.posts[post.id];
      saveData();

      await message.author.send(
        makePanel(
          "ERRO NA PUBLICAÇÃO",
          "Não foi possível publicar sua mídia. Tente novamente."
        )
      ).catch(() => {});
    }

  } catch (error) {
    console.error("Erro ao processar publicação:", error);
  } finally {
    processingUsers.delete(lock);
  }
}

// ==========================================
// MODAL DE COMENTÁRIO
// ==========================================

function commentModal(guildId, postId) {
  return new ModalBuilder()
    .setCustomId(`modal:comment:${guildId}:${postId}`)
    .setTitle("Comentar publicação")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("comment")
          .setLabel("Seu comentário")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
}

// ==========================================
// MODAL DE EDIÇÃO DA LEGENDA
// ==========================================

function captionModal(guildId, postId, caption) {
  return new ModalBuilder()
    .setCustomId(`modal:caption:${guildId}:${postId}`)
    .setTitle("Editar legenda")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("caption")
          .setLabel("Nova legenda")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(false)
          .setValue(caption.slice(0, 1500))
      )
    );
}

// ==========================================
// INTERAÇÕES DOS POSTS E PAINEL DO MEMBRO
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split(":");
  const section = parts[0];

  if (section !== "post" && section !== "member") return;

  const operation = parts[1];
  const guildId = parts[2];
  const postId = parts[3];

  try {
    const post = findPost(guildId, postId);

    if (!post) {
      return replyPrivate(
        interaction,
        "Essa publicação não existe mais."
      );
    }

    const data = getGuild(guildId);

    if (section === "post") {
      if (operation === "like") {
        if (!data.likesEnabled) {
          return replyPrivate(interaction, "Curtidas estão desativadas.");
        }

        const index = post.likes.indexOf(interaction.user.id);

        if (index >= 0) {
          post.likes.splice(index, 1);
        } else {
          post.likes.push(interaction.user.id);
        }

        saveData();

        await interaction.deferUpdate();
        await refreshPost(guildId, postId);

        return;
      }

      if (operation === "comment") {
        if (!data.commentsEnabled) {
          return replyPrivate(interaction, "Comentários estão desativados.");
        }

        return interaction.showModal(
          commentModal(guildId, postId)
        );
      }

      if (operation === "interactions") {
        const likes = post.likes.length
          ? post.likes.slice(0, 20).map(id => `<@${id}>`).join("\n")
          : "Ninguém curtiu ainda.";

        const comments = post.comments.length
          ? post.comments.slice(-10).map(item =>
              `**${item.authorTag}:** ${item.text}`
            ).join("\n")
          : "Nenhum comentário ainda.";

        return replyPrivate(
          interaction,
          `**Curtidas**\n${likes}\n\n**Comentários**\n${comments}`
        );
      }
    }

    if (section === "member") {
      if (!isPostAuthor(post, interaction.user.id)) {
        return replyPrivate(
          interaction,
          "Somente o autor pode administrar essa publicação."
        );
      }

      if (operation === "edit") {
        return interaction.showModal(
          captionModal(guildId, postId, post.caption || "")
        );
      }

      if (operation === "media") {
        return replyPrivate(
          interaction,
          "A edição de mídia ainda precisa ser configurada."
        );
      }

      if (operation === "links") {
        return replyPrivate(
          interaction,
          "O painel de redes sociais será configurado na próxima atualização."
        );
      }

      if (operation === "interactions") {
        const likes = post.likes.length
          ? post.likes.slice(0, 20).map(id => `<@${id}>`).join("\n")
          : "Ninguém curtiu ainda.";

        const comments = post.comments.length
          ? post.comments.slice(-10).map(item =>
              `**${item.authorTag}:** ${item.text}`
            ).join("\n")
          : "Nenhum comentário ainda.";

        return replyPrivate(
          interaction,
          `**Curtidas**\n${likes}\n\n**Comentários**\n${comments}`
        );
      }

      if (operation === "delete") {
        const guild = await client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(data.channelId);

        if (channel && channel.isTextBased() && post.messageId) {
          const message = await channel.messages.fetch(post.messageId)
            .catch(() => null);

          if (message) {
            await message.delete().catch(() => {});
          }
        }

        delete data.posts[postId];
        saveData();

        return replyPrivate(
          interaction,
          "Sua publicação foi excluída."
        );
      }
    }

  } catch (error) {
    console.error("Erro nas interações:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(
        interaction,
        "Ocorreu um erro ao executar essa ação."
      ).catch(() => {});
    }
  }
});

// ==========================================
// MODAIS DE MEMBROS
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  const parts = interaction.customId.split(":");

  if (parts[0] !== "modal") return;

  const type = parts[1];
  const guildId = parts[2];
  const postId = parts[3];

  const post = findPost(guildId, postId);

  if (!post) {
    return replyPrivate(interaction, "Publicação não encontrada.");
  }

  try {
    if (type === "comment") {
      const data = getGuild(guildId);

      if (!data.commentsEnabled) {
        return replyPrivate(interaction, "Comentários estão desativados.");
      }

      const text = interaction.fields
        .getTextInputValue("comment")
        .trim();

      if (!text) {
        return replyPrivate(interaction, "O comentário não pode ficar vazio.");
      }

      post.comments.push({
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        text,
        createdAt: Date.now()
      });

      saveData();

      await refreshPost(guildId, postId);

      return replyPrivate(interaction, "Comentário publicado.");
    }

    if (type === "caption") {
      if (!isPostAuthor(post, interaction.user.id)) {
        return replyPrivate(interaction, "Somente o autor pode editar a legenda.");
      }

      post.caption = interaction.fields
        .getTextInputValue("caption")
        .trim();

      saveData();

      await refreshPost(guildId, postId);

      return replyPrivate(interaction, "Legenda atualizada.");
    }

  } catch (error) {
    console.error("Erro ao enviar modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(interaction, "Não foi possível concluir a ação.")
        .catch(() => {});
    }
  }
});

// ==========================================
// RECEBER MENSAGENS NO CANAL DO FEED
// ==========================================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const data = getGuild(message.guild.id);

  if (!data.enabled || !data.channelId) return;
  if (message.channel.id !== data.channelId) return;

  await createPost(message);
});

// ==========================================
// FIM DA PARTE 2
// A PARTE 3 CONTINUA DESTE PONTO
// ==========================================
// ==========================================
// PAINEL ADMINISTRATIVO
// ==========================================

function adminPanel(guildId) {
  const data = getGuild(guildId);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`admin:channel:${guildId}`)
    .setPlaceholder("Selecionar canal do Instagram")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);

  const row1 = new ActionRowBuilder().addComponents(
    makeButton(
      `admin:toggle:${guildId}`,
      data.enabled ? "Desativar feed" : "Ativar feed",
      data.emojis.config
    ),
    makeButton(
      `admin:likes:${guildId}`,
      data.likesEnabled ? "Desativar curtidas" : "Ativar curtidas",
      data.emojis.like
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    makeButton(
      `admin:comments:${guildId}`,
      data.commentsEnabled ? "Desativar comentários" : "Ativar comentários",
      data.emojis.comment
    ),
    makeButton(
      `admin:timers:${guildId}`,
      "Configurar tempos",
      data.emojis.clock
    )
  );

  const row3 = new ActionRowBuilder().addComponents(
    makeButton(
      `admin:emojis:${guildId}`,
      "Personalizar emojis",
      data.emojis.config
    )
  );

  return makePanel(
    "CEMETERY — CONFIGURAÇÃO",
    [
      `**Status:** ${data.enabled ? "Ativado" : "Desativado"}`,
      `**Canal:** ${data.channelId ? `<#${data.channelId}>` : "Não selecionado"}`,
      `**Cooldown:** ${data.cooldown / 60} minutos`,
      `**Processamento:** ${data.processingDelay / 1000} segundos`,
      `**Curtidas:** ${data.likesEnabled ? "Ativadas" : "Desativadas"}`,
      `**Comentários:** ${data.commentsEnabled ? "Ativados" : "Desativados"}`,
      "",
      "Selecione o canal abaixo para configurar o feed."
    ].join("\n"),
    [
      new ActionRowBuilder().addComponents(channelSelect),
      row1,
      row2,
      row3
    ]
  );
}

// ==========================================
// MODAL DE TEMPOS
// ==========================================

function timersModal(guildId) {
  const data = getGuild(guildId);

  return new ModalBuilder()
    .setCustomId(`adminmodal:timers:${guildId}`)
    .setTitle("Configurar tempos")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("cooldown")
          .setLabel("Cooldown em minutos")
          .setStyle(TextInputStyle.Short)
          .setValue(String(data.cooldown / 60))
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("processing")
          .setLabel("Processamento em segundos")
          .setStyle(TextInputStyle.Short)
          .setValue(String(data.processingDelay / 1000))
          .setRequired(true)
      )
    );
}

// ==========================================
// MODAL DE EMOJIS
// ==========================================

function emojisModal(guildId) {
  const data = getGuild(guildId);

  const fields = [
    ["like", "Emoji de curtir"],
    ["comment", "Emoji de comentar"],
    ["delete", "Emoji de excluir"],
    ["link", "Emoji de links"],
    ["config", "Emoji de configuração"]
  ];

  const modal = new ModalBuilder()
    .setCustomId(`adminmodal:emojis:${guildId}`)
    .setTitle("Personalizar emojis");

  for (const [name, label] of fields) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(name)
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setValue(data.emojis[name] || "")
          .setRequired(true)
          .setMaxLength(100)
      )
    );
  }

  return modal;
}

// ==========================================
// COMANDO /CONFIG
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "config") return;

  if (!interaction.guildId) {
    return interaction.reply({
      content: "Use /config dentro de um servidor.",
      ephemeral: true
    });
  }

  if (!isOwner(interaction.user.id)) {
    return interaction.reply({
      content: "Você não tem autorização para configurar o Cemetery.",
      ephemeral: true
    });
  }

  try {
    const panel = adminPanel(interaction.guildId);

    await interaction.reply({
      ...panel,
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    });

  } catch (error) {
    console.error("Erro ao abrir configuração:", error);

    if (!interaction.replied) {
      await interaction.reply({
        content: "Não foi possível abrir o painel.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==========================================
// BOTÕES E SELETOR DO PAINEL
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isMessageComponent()) return;

  const parts = interaction.customId.split(":");

  if (parts[0] !== "admin") return;

  const operation = parts[1];
  const guildId = parts[2];

  if (!isOwner(interaction.user.id)) {
    return replyPrivate(interaction, "Acesso negado.");
  }

  if (interaction.guildId !== guildId) {
    return replyPrivate(
      interaction,
      "Essa configuração pertence a outro servidor."
    );
  }

  const data = getGuild(guildId);

  try {
    if (interaction.isChannelSelectMenu()) {
      if (operation !== "channel") return;

      data.channelId = interaction.values[0];

      saveData();

      return interaction.update({
        ...adminPanel(guildId),
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (!interaction.isButton()) return;

    if (operation === "toggle") {
      if (!data.channelId) {
        return replyPrivate(
          interaction,
          "Selecione primeiro o canal de publicações."
        );
      }

      data.enabled = !data.enabled;
    }

    if (operation === "likes") {
      data.likesEnabled = !data.likesEnabled;
    }

    if (operation === "comments") {
      data.commentsEnabled = !data.commentsEnabled;
    }

    if (operation === "timers") {
      return interaction.showModal(timersModal(guildId));
    }

    if (operation === "emojis") {
      return interaction.showModal(emojisModal(guildId));
    }

    saveData();

    return interaction.update({
      ...adminPanel(guildId),
      flags: MessageFlags.IsComponentsV2
    });

  } catch (error) {
    console.error("Erro no painel:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(
        interaction,
        "Não foi possível atualizar essa configuração."
      ).catch(() => {});
    }
  }
});

// ==========================================
// MODAIS ADMINISTRATIVOS
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  const parts = interaction.customId.split(":");

  if (parts[0] !== "adminmodal") return;

  const type = parts[1];
  const guildId = parts[2];

  if (!isOwner(interaction.user.id)) {
    return replyPrivate(interaction, "Acesso negado.");
  }

  if (interaction.guildId !== guildId) {
    return replyPrivate(
      interaction,
      "Essa configuração pertence a outro servidor."
    );
  }

  const data = getGuild(guildId);

  try {
    if (type === "timers") {
      const cooldown = Number(
        interaction.fields.getTextInputValue("cooldown")
      );

      const processing = Number(
        interaction.fields.getTextInputValue("processing")
      );

      if (
        !Number.isFinite(cooldown) ||
        !Number.isFinite(processing) ||
        cooldown < 1 ||
        cooldown > 10080 ||
        processing < 1 ||
        processing > 120
      ) {
        return replyPrivate(
          interaction,
          "Valores inválidos. Cooldown: 1 a 10080 minutos. Processamento: 1 a 120 segundos."
        );
      }

      data.cooldown = cooldown * 60;
      data.processingDelay = processing * 1000;

      saveData();

      return replyPrivate(
        interaction,
        `Configurações salvas.\nCooldown: ${cooldown} minutos.\nProcessamento: ${processing} segundos.`
      );
    }

    if (type === "emojis") {
      const names = [
        "like",
        "comment",
        "delete",
        "link",
        "config"
      ];

      for (const name of names) {
        const value = interaction.fields
          .getTextInputValue(name)
          .trim();

        if (!value) {
          return replyPrivate(
            interaction,
            "Preencha todos os campos de emoji."
          );
        }

        data.emojis[name] = value;
      }

      saveData();

      return replyPrivate(
        interaction,
        "Emojis personalizados salvos."
      );
    }

  } catch (error) {
    console.error("Erro ao salvar modal:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(
        interaction,
        "Não foi possível salvar as alterações."
      ).catch(() => {});
    }
  }
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================

client.once("ready", async () => {
  console.log(`Cemetery conectado: ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Erro ao registrar /config:", error);
  }
});

if (!TOKEN) {
  console.error("DISCORD_TOKEN não foi configurado.");
} else {
  client.login(TOKEN).catch(error => {
    console.error("Erro ao conectar o bot:", error);
  });
}

// ==========================================
// FIM DO INDEX.JS
// ==========================================
