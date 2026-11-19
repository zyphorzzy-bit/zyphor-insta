
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

const OWNER_IDS = [
  "1541239768010981378",
  "1533306874513068093"
];

const DEFAULT_COOLDOWN = 600;
const DEFAULT_PROCESSING_DELAY = 5000;

const DATA_PATH = path.join(__dirname, "data.json");

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
          global: {
            owners: OWNER_IDS
          }
        }, null, 2)
      );
    }

    const parsed = JSON.parse(
      fs.readFileSync(DATA_PATH, "utf8")
    );

    if (!parsed.guilds) parsed.guilds = {};
    if (!parsed.global) parsed.global = {};
    if (!Array.isArray(parsed.global.owners)) {
      parsed.global.owners = OWNER_IDS;
    }

    return parsed;

  } catch (error) {
    console.error("Erro ao carregar data.json:", error);

    return {
      guilds: {},
      global: {
        owners: OWNER_IDS
      }
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

// ==========================================
// DONOS
// ==========================================

function isOwner(userId) {
  return OWNER_IDS.includes(userId);
}

// ==========================================
// CONFIGURAÇÃO POR SERVIDOR
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

  if (!data.posts) data.posts = {};
  if (!data.profiles) data.profiles = {};

  data.emojis = {
    ...EMOJIS,
    ...(data.emojis || {})
  };

  return data;
}

// ==========================================
// PERFIL DO MEMBRO
// ==========================================

function getProfile(guildData, userId) {
  if (!guildData.profiles[userId]) {
    guildData.profiles[userId] = {
      instagram: null,
      tiktok: null,
      lastPostAt: 0
    };
  }

  return guildData.profiles[userId];
}

// ==========================================
// PAINÉIS COMPONENTS V2
// ==========================================

function makePanel(title, description, rows = []) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${title}\n${description}`
      )
    );

  if (rows.length) {
    container.addSeparatorComponents(
      new SeparatorBuilder()
    );

    for (const row of rows) {
      container.addActionRowComponents(row);
    }
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: []
    }
  };
}

// ==========================================
// BOTÕES CINZAS
// ==========================================

function makeButton(customId, label, emoji) {
  const button = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(ButtonStyle.Secondary);

  if (emoji) {
    button.setEmoji(emoji);
  }

  return button;
}

// ==========================================
// COMANDO CONFIG
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Abrir painel administrativo do Cemetery")
    .toJSON()
];

// ==========================================
// REGISTRO DE COMANDOS
// ==========================================

async function registerCommands() {
  if (!TOKEN || !CLIENT_ID) {
    console.warn(
      "DISCORD_TOKEN ou CLIENT_ID não configurado."
    );
    return;
  }

  const rest = new REST({ version: "10" })
    .setToken(TOKEN);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log("Comando /config registrado.");
}

// ==========================================
// UTILITÁRIO
// ==========================================

function makePostId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
}

// PARTE 2 CONTINUA AQUI
// ==========================================
// CEMETERY - PARTE 2/3
// PUBLICAÇÕES E INTERAÇÕES
// ==========================================

// ==========================================
// RESPOSTA PRIVADA COMPONENTS V2
// ==========================================

async function replyPrivate(interaction, content) {
  const payload = makePanel("Cemetery", content);

  payload.flags =
    MessageFlags.IsComponentsV2 |
    MessageFlags.Ephemeral;

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

// ==========================================
// LOCALIZAR PUBLICAÇÃO
// ==========================================

function findPost(guildId, postId) {
  const data = getGuild(guildId);
  return data.posts[postId] || null;
}

function isPostAuthor(post, userId) {
  return Boolean(post && post.authorId === userId);
}

// ==========================================
// OBTER MÍDIA
// ==========================================

function getMedia(message) {
  const attachment = message.attachments.find(item => {
    const type = item.contentType || "";

    return (
      type.startsWith("image/") ||
      type.startsWith("video/")
    );
  });

  if (!attachment) return null;

  return {
    url: attachment.url,
    name: attachment.name || "media",
    contentType: attachment.contentType || ""
  };
}

// ==========================================
// PAINEL PRIVADO DO MEMBRO
// ==========================================

async function sendMemberPanel(user, guildId, postId) {
  const data = getGuild(guildId);

  const row1 = new ActionRowBuilder().addComponents(
    makeButton(
      `member:edit:${guildId}:${postId}`,
      "Editar legenda",
      data.emojis.document
    ),
    makeButton(
      `member:media:${guildId}:${postId}`,
      "Alterar mídia",
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
    )
  );

  const row3 = new ActionRowBuilder().addComponents(
    makeButton(
      `member:delete:${guildId}:${postId}`,
      "Excluir publicação",
      data.emojis.delete
    )
  );

  try {
    await user.send(
      makePanel(
        "GERENCIAR PUBLICAÇÃO",
        "Este é seu painel privado. Aqui você pode editar sua legenda, trocar a mídia, administrar seus links e excluir sua publicação.",
        [row1, row2, row3]
      )
    );
  } catch {
    console.log(
      `Não foi possível enviar painel para ${user.id}`
    );
  }
}

// ==========================================
// CRIAR PUBLICAÇÃO
// ==========================================

async function createPost(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  const data = getGuild(guildId);

  if (!data.enabled || !data.channelId) return;

  if (message.channel.id !== data.channelId) return;

  const media = getMedia(message);

  if (!media) {
    await message.delete().catch(() => {});
    return;
  }

  const profile = getProfile(data, userId);
  const now = Date.now();

  const cooldownMs = data.cooldown * 1000;
  const remaining = cooldownMs - (now - profile.lastPostAt);

  if (remaining > 0) {
    await message.delete().catch(() => {});

    const minutes = Math.ceil(remaining / 60000);

    try {
      await message.author.send(
        makePanel(
          "AGUARDE",
          `Você poderá publicar novamente em aproximadamente ${minutes} minuto(s).`
        )
      );
    } catch {}

    return;
  }

  if (!message.member.permissions.has("ViewChannel")) {
    return;
  }

  const postId = makePostId();

  const post = {
    id: postId,
    guildId,
    authorId: userId,
    caption: message.content || "",
    mediaUrl: media.url,
    mediaName: media.name,
    mediaType: media.contentType,
    likes: [],
    comments: [],
    messageId: null,
    approved: !data.approval,
    createdAt: now
  };

  // Evita duas publicações simultâneas do mesmo membro.
  const processingKey = `${guildId}:${userId}`;

  if (!globalThis.cemeteryProcessing) {
    globalThis.cemeteryProcessing = new Set();
  }

  if (globalThis.cemeteryProcessing.has(processingKey)) {
    await message.delete().catch(() => {});
    return;
  }

  globalThis.cemeteryProcessing.add(processingKey);

  try {
    await new Promise(resolve =>
      setTimeout(
        resolve,
        Math.max(1000, Math.min(data.processingDelay, 120000))
      )
    );

    const currentMessage = await message.channel.messages
      .fetch(message.id)
      .catch(() => null);

    if (!currentMessage) return;

    if (data.approval) {
      data.posts[postId] = {
        ...post,
        sourceMessageId: message.id
      };

      saveData();

      await message.delete().catch(() => {});

      await message.author.send(
        makePanel(
          "PUBLICAÇÃO RECEBIDA",
          "Sua publicação está aguardando aprovação da equipe."
        )
      ).catch(() => {});

      return;
    }

    data.posts[postId] = post;

    const published = await publishPost(guildId, postId);

    if (!published) {
      delete data.posts[postId];
      saveData();
      return;
    }

    profile.lastPostAt = Date.now();

    saveData();

    await message.delete().catch(() => {});

    await sendMemberPanel(
      message.author,
      guildId,
      postId
    );

  } catch (error) {
    console.error("Erro ao criar publicação:", error);

    delete data.posts[postId];
    saveData();

  } finally {
    globalThis.cemeteryProcessing.delete(processingKey);
  }
}

// ==========================================
// PUBLICAR NO CANAL
// ==========================================

async function publishPost(guildId, postId) {
  const data = getGuild(guildId);
  const post = data.posts[postId];

  if (!post || !post.approved) return false;

  const channel = await client.channels.fetch(
    data.channelId
  ).catch(() => null);

  if (!channel || !channel.isTextBased()) return false;

  const row = new ActionRowBuilder().addComponents(
    makeButton(
      `post:like:${guildId}:${postId}`,
      `Curtir (${post.likes.length})`,
      data.emojis.like
    ),
    makeButton(
      `post:comment:${guildId}:${postId}`,
      `Comentar (${post.comments.length})`,
      data.emojis.comment
    ),
    makeButton(
      `post:interactions:${guildId}:${postId}`,
      "Interações",
      data.emojis.document
    )
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Publicação\n${post.caption || " "}\n\nPublicado por <@${post.authorId}>`
      )
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(post.mediaUrl)
          .setDescription("Mídia da publicação")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addActionRowComponents(row);

  const message = await channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: []
    }
  }).catch(error => {
    console.error("Erro ao publicar mídia:", error);
    return null;
  });

  if (!message) return false;

  post.messageId = message.id;
  saveData();

  return true;
}

// ==========================================
// ATUALIZAR PUBLICAÇÃO
// ==========================================

async function refreshPost(guildId, postId) {
  const data = getGuild(guildId);
  const post = data.posts[postId];

  if (!post || !post.messageId) return;

  const channel = await client.channels.fetch(
    data.channelId
  ).catch(() => null);

  if (!channel || !channel.isTextBased()) return;

  const message = await channel.messages.fetch(
    post.messageId
  ).catch(() => null);

  if (!message) return;

  const row = new ActionRowBuilder();

  if (data.likesEnabled) {
    row.addComponents(
      makeButton(
        `post:like:${guildId}:${postId}`,
        `Curtir (${post.likes.length})`,
        data.emojis.like
      )
    );
  }

  if (data.commentsEnabled) {
    row.addComponents(
      makeButton(
        `post:comment:${guildId}:${postId}`,
        `Comentar (${post.comments.length})`,
        data.emojis.comment
      )
    );
  }

  row.addComponents(
    makeButton(
      `post:interactions:${guildId}:${postId}`,
      "Interações",
      data.emojis.document
    )
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# Publicação\n${post.caption || " "}\n\nPublicado por <@${post.authorId}>`
      )
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setURL(post.mediaUrl)
          .setDescription("Mídia da publicação")
      )
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addActionRowComponents(row);

  await message.edit({
    components: [container],
    allowedMentions: { parse: [] }
  });
}

// ==========================================
// MODAIS
// ==========================================

function commentModal(guildId, postId) {
  return new ModalBuilder()
    .setCustomId(`modal:comment:${guildId}:${postId}`)
    .setTitle("Comentar")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("comment")
          .setLabel("Escreva seu comentário")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
}

function editCaptionModal(guildId, postId, caption) {
  return new ModalBuilder()
    .setCustomId(`modal:edit:${guildId}:${postId}`)
    .setTitle("Editar legenda")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("caption")
          .setLabel("Nova legenda")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1500)
          .setRequired(false)
          .setValue(caption || " ")
      )
    );
}

// ==========================================
// VALIDAR LINKS
// ==========================================

function validSocialLink(type, value) {
  if (!value) return true;

  try {
    const url = new URL(value.trim());

    if (url.protocol !== "https:") return false;
    if (url.username || url.password || url.port) return false;

    const host = url.hostname.toLowerCase();

    if (type === "instagram") {
      return (
        ["instagram.com", "www.instagram.com"].includes(host) &&
        /^\/[a-zA-Z0-9._]+\/?$/.test(url.pathname)
      );
    }

    if (type === "tiktok") {
      return (
        ["tiktok.com", "www.tiktok.com"].includes(host) &&
        /^\/@[a-zA-Z0-9._]+\/?$/.test(url.pathname)
      );
    }

    return false;
  } catch {
    return false;
  }
}

// ==========================================
// PAINEL DE REDES SOCIAIS
// ==========================================

async function sendSocialPanel(interaction, guildId, postId) {
  const data = getGuild(guildId);
  const post = findPost(guildId, postId);

  if (!isPostAuthor(post, interaction.user.id)) {
    return replyPrivate(interaction, "Acesso negado.");
  }

  const profile = getProfile(data, interaction.user.id);

  const row1 = new ActionRowBuilder().addComponents(
    makeButton(
      `social:instagram:${guildId}:${postId}`,
      "Instagram",
      data.emojis.instagram
    ),
    makeButton(
      `social:tiktok:${guildId}:${postId}`,
      "TikTok",
      data.emojis.tiktok
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    makeButton(
      `social:removeinstagram:${guildId}:${postId}`,
      "Remover Instagram",
      data.emojis.delete
    ),
    makeButton(
      `social:removetiktok:${guildId}:${postId}`,
      "Remover TikTok",
      data.emojis.delete
    )
  );

  return interaction.reply(
    makePanel(
      "REDES SOCIAIS",
      `Instagram: ${profile.instagram ? "Configurado" : "Não configurado"}\nTikTok: ${profile.tiktok ? "Configurado" : "Não configurado"}`,
      [row1, row2]
    )
  );
}

// ==========================================
// VER INTERAÇÕES
// ==========================================

async function showInteractions(interaction, guildId, postId) {
  const post = findPost(guildId, postId);

  if (!post) {
    return replyPrivate(interaction, "Publicação não encontrada.");
  }

  const likes = post.likes.length
    ? post.likes.slice(0, 20).map(id => `• <@${id}>`).join("\n")
    : "Ninguém curtiu ainda.";

  const comments = post.comments.length
    ? post.comments.slice(-10).map(item =>
        `**${item.authorTag}:** ${item.text}`
      ).join("\n")
    : "Nenhum comentário ainda.";

  return replyPrivate(
    interaction,
    `## Curtidas (${post.likes.length})\n${likes}\n\n## Comentários (${post.comments.length})\n${comments}`
  );
}

// ==========================================
// PROCESSAR BOTÕES
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  try {
    const parts = interaction.customId.split(":");
    const action = parts[0];
    const operation = parts[1];
    const guildId = parts[2];
    const postId = parts[3];

    if (action === "post") {
      const data = getGuild(guildId);
      const post = findPost(guildId, postId);

      if (!post || !post.approved) {
        return replyPrivate(interaction, "Publicação indisponível.");
      }

      if (operation === "like") {
        if (!data.likesEnabled) {
          return replyPrivate(interaction, "Curtidas desativadas.");
        }

        const index = post.likes.indexOf(interaction.user.id);

        if (index === -1) {
          post.likes.push(interaction.user.id);
        } else {
          post.likes.splice(index, 1);
        }

        saveData();

        await interaction.deferUpdate();
        return refreshPost(guildId, postId);
      }

      if (operation === "comment") {
        if (!data.commentsEnabled) {
          return replyPrivate(interaction, "Comentários desativados.");
        }

        return interaction.showModal(
          commentModal(guildId, postId)
        );
      }

      if (operation === "interactions") {
        return showInteractions(interaction, guildId, postId);
      }
    }

    if (action === "member") {
      const post = findPost(guildId, postId);

      if (!isPostAuthor(post, interaction.user.id)) {
        return replyPrivate(interaction, "Acesso negado.");
      }

      if (operation === "edit") {
        return interaction.showModal(
          editCaptionModal(guildId, postId, post.caption)
        );
      }

      if (operation === "links") {
        return sendSocialPanel(interaction, guildId, postId);
      }

      if (operation === "interactions") {
        return showInteractions(interaction, guildId, postId);
      }

      if (operation === "media") {
        return replyPrivate(
          interaction,
          "A troca de mídia será disponibilizada no painel de edição."
        );
      }

      if (operation === "delete") {
        const data = getGuild(guildId);

        const channel = await client.channels.fetch(
          data.channelId
        ).catch(() => null);

        if (channel && post.messageId) {
          const message = await channel.messages.fetch(
            post.messageId
          ).catch(() => null);

          if (message) await message.delete().catch(() => {});
        }

        delete data.posts[postId];
        saveData();

        return replyPrivate(
          interaction,
          "Publicação excluída."
        );
      }
    }

    if (action === "social") {
      const data = getGuild(guildId);
      const post = findPost(guildId, postId);

      if (!isPostAuthor(post, interaction.user.id)) {
        return replyPrivate(interaction, "Acesso negado.");
      }

      const profile = getProfile(data, interaction.user.id);

      if (operation === "instagram" || operation === "tiktok") {
        const type = operation;

        const modal = new ModalBuilder()
          .setCustomId(`modal:${type}:${guildId}:${postId}`)
          .setTitle(type === "instagram" ? "Instagram" : "TikTok")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("url")
                .setLabel("Link do seu perfil")
                .setStyle(TextInputStyle.Short)
                .setValue(profile[type] || "")
                .setRequired(false)
                .setMaxLength(200)
            )
          );

        return interaction.showModal(modal);
      }

      if (operation === "removeinstagram") {
        profile.instagram = null;
        saveData();

        return replyPrivate(interaction, "Instagram removido.");
      }

      if (operation === "removetiktok") {
        profile.tiktok = null;
        saveData();

        return replyPrivate(interaction, "TikTok removido.");
      }
    }

  } catch (error) {
    console.error("Erro nos botões:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(interaction, "Erro ao processar botão.")
        .catch(() => {});
    }
  }
});

// ==========================================
// PROCESSAR MODAIS
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  try {
    const parts = interaction.customId.split(":");

    const type = parts[1];
    const guildId = parts[2];
    const postId = parts[3];

    const data = getGuild(guildId);
    const post = findPost(guildId, postId);

    if (!post) {
      return replyPrivate(interaction, "Publicação não encontrada.");
    }

    if (
      type !== "comment" &&
      !isPostAuthor(post, interaction.user.id)
    ) {
      return replyPrivate(interaction, "Acesso negado.");
    }

    if (type === "comment") {
      if (!data.commentsEnabled) {
        return replyPrivate(interaction, "Comentários desativados.");
      }

      const text = interaction.fields
        .getTextInputValue("comment")
        .trim();

      if (!text) {
        return replyPrivate(interaction, "Comentário vazio.");
      }

      post.comments.push({
        authorId: interaction.user.id,
        authorTag: interaction.user.username,
        text,
        createdAt: Date.now()
      });

      saveData();

      await refreshPost(guildId, postId);

      return replyPrivate(interaction, "Comentário publicado.");
    }

    if (type === "edit") {
      post.caption = interaction.fields
        .getTextInputValue("caption")
        .trim();

      saveData();

      await refreshPost(guildId, postId);

      return replyPrivate(interaction, "Legenda atualizada.");
    }

    if (type === "instagram" || type === "tiktok") {
      const url = interaction.fields
        .getTextInputValue("url")
        .trim();

      if (url && !validSocialLink(type, url)) {
        return replyPrivate(
          interaction,
          "Link inválido. Informe o endereço oficial do seu perfil."
        );
      }

      const profile = getProfile(data, interaction.user.id);

      profile[type] = url || null;

      saveData();

      return replyPrivate(interaction, "Link atualizado.");
    }

  } catch (error) {
    console.error("Erro nos modais:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(interaction, "Erro ao processar formulário.")
        .catch(() => {});
    }
  }
});

// ==========================================
// RECEBER PUBLICAÇÕES
// ==========================================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;

  const data = getGuild(message.guild.id);

  if (!data.enabled || !data.channelId) return;
  if (message.channel.id !== data.channelId) return;

  await createPost(message);
});

// PARTE 3 CONTINUA AQUI
// ==========================================
// CEMETERY - PARTE 3/3
// ADMINISTRAÇÃO E INICIALIZAÇÃO
// ==========================================

// ==========================================
// PAINEL ADMINISTRATIVO
// ==========================================

function adminPanel(guildId) {
  const data = getGuild(guildId);

  const channelSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`admin:channel:${guildId}`)
    .setPlaceholder("Selecionar canal de publicações")
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
      `admin:approval:${guildId}`,
      data.approval ? "Desativar aprovação" : "Ativar aprovação",
      data.emojis.document
    )
  );

  const row2 = new ActionRowBuilder().addComponents(
    makeButton(
      `admin:likes:${guildId}`,
      data.likesEnabled ? "Desativar curtidas" : "Ativar curtidas",
      data.emojis.like
    ),
    makeButton(
      `admin:comments:${guildId}`,
      data.commentsEnabled ? "Desativar comentários" : "Ativar comentários",
      data.emojis.comment
    )
  );

  const row3 = new ActionRowBuilder().addComponents(
    makeButton(
      `admin:timers:${guildId}`,
      "Configurar tempos",
      data.emojis.clock
    ),
    makeButton(
      `admin:emojis:${guildId}`,
      "Personalizar emojis",
      data.emojis.config
    )
  );

  return makePanel(
    "CEMETERY — ADMINISTRAÇÃO",
    [
      `**Servidor:** ${guildId}`,
      `**Status:** ${data.enabled ? "Ativado" : "Desativado"}`,
      `**Canal:** ${data.channelId ? `<#${data.channelId}>` : "Não configurado"}`,
      `**Cooldown:** ${data.cooldown / 60} minutos`,
      `**Processamento:** ${data.processingDelay / 1000} segundos`,
      `**Aprovação:** ${data.approval ? "Ativada" : "Desativada"}`,
      `**Curtidas:** ${data.likesEnabled ? "Ativadas" : "Desativadas"}`,
      `**Comentários:** ${data.commentsEnabled ? "Ativados" : "Desativados"}`,
      "",
      "Configure o feed usando os controles abaixo."
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
    ["document", "Emoji de interações"],
    ["config", "Emoji de configuração"],
    ["clock", "Emoji de tempo"],
    ["instagram", "Emoji do Instagram"],
    ["tiktok", "Emoji do TikTok"]
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

  try {
    if (!isOwner(interaction.user.id)) {
      return interaction.reply({
        content: "Você não tem autorização para acessar o Cemetery.",
        ephemeral: true
      });
    }

    if (!interaction.guildId) {
      return interaction.reply({
        content: "Use esse comando dentro de um servidor.",
        ephemeral: true
      });
    }

    await interaction.deferReply({
      ephemeral: true
    });

    try {
      await interaction.user.send(
        adminPanel(interaction.guildId)
      );

      await interaction.editReply({
        content: "Painel administrativo enviado na sua DM."
      });

    } catch (error) {
      await interaction.editReply({
        content: "Não consegui enviar a DM. Ative as mensagens privadas."
      });
    }

  } catch (error) {
    console.error("Erro no /config:", error);
  }
});

// ==========================================
// INTERAÇÕES DO PAINEL ADMIN
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isMessageComponent()) return;

  const parts = interaction.customId.split(":");

  if (parts[0] !== "admin") return;

  const operation = parts[1];
  const guildId = parts[2];

  try {
    if (!isOwner(interaction.user.id)) {
      return replyPrivate(interaction, "Acesso negado.");
    }

    const data = getGuild(guildId);

    if (interaction.isChannelSelectMenu()) {
      if (operation !== "channel") return;

      data.channelId = interaction.values[0];

      saveData();

      return interaction.update(
        adminPanel(guildId)
      );
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

    if (operation === "approval") {
      data.approval = !data.approval;
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

    return interaction.update(
      adminPanel(guildId)
    );

  } catch (error) {
    console.error("Erro no painel administrativo:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(
        interaction,
        "Não foi possível atualizar essa configuração."
      ).catch(() => {});
    }
  }
});

// ==========================================
// MODAIS ADMIN
// ==========================================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  const parts = interaction.customId.split(":");

  if (parts[0] !== "adminmodal") return;

  const type = parts[1];
  const guildId = parts[2];

  try {
    if (!isOwner(interaction.user.id)) {
      return replyPrivate(interaction, "Acesso negado.");
    }

    const data = getGuild(guildId);

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
        `Tempos atualizados.\nCooldown: ${cooldown} minutos.\nProcessamento: ${processing} segundos.`
      );
    }

    if (type === "emojis") {
      const names = [
        "like",
        "comment",
        "delete",
        "link",
        "document",
        "config",
        "clock",
        "instagram",
        "tiktok"
      ];

      for (const name of names) {
        const value = interaction.fields
          .getTextInputValue(name)
          .trim();

        if (!value) {
          return replyPrivate(
            interaction,
            "Todos os campos de emoji precisam ser preenchidos."
          );
        }

        data.emojis[name] = value;
      }

      saveData();

      return replyPrivate(
        interaction,
        "Emojis atualizados com sucesso."
      );
    }

  } catch (error) {
    console.error("Erro nos modais administrativos:", error);

    if (!interaction.replied && !interaction.deferred) {
      await replyPrivate(
        interaction,
        "Erro ao salvar as configurações."
      ).catch(() => {});
    }
  }
});

// ==========================================
// READY
// ==========================================

client.once("ready", async () => {
  console.log(`Cemetery conectado como ${client.user.tag}`);

  try {
    await registerCommands();
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// ==========================================
// LOGIN
// ==========================================

if (!TOKEN) {
  console.error("Configure DISCORD_TOKEN nas variáveis da hospedagem.");
} else {
  client.login(TOKEN).catch(error => {
    console.error("Erro ao conectar o Cemetery:", error);
  });
}

// ==========================================
// FIM DO CEMETERY
// ==========================================
