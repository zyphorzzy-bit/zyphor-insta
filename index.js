
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require("discord.js");

const fs = require("node:fs");
const path = require("node:path");

// ==================== CONFIGURAÇÃO ====================

const TOKEN = process.env.DISCORD_TOKEN;
const DONA_ID = "1541239768010981378";
const DONO_ID = "1533306874513068093";
const DONOS = [DONA_ID, DONO_ID];

const DATA_PATH = path.join(__dirname, "data.json");
const COOLDOWN = 5 * 60 * 1000;

const EMOJIS_PADRAO = {
  like: "<:like:1552007813709172766>",
  lixo: "<:lixo:1552009637170253894>",
  insta: "<:insta:1552009638487138427>",
  corao: "<:corao:1552010611393700011>",
  link: "<:link:1552009621999452160>",
  posse: "<:posse:1552007807535153262>",
  digitar: "<:digitar:1550347102662434857>",
  cometrio: "<:cometrio:1552009642081788016>",
  config: "<:config:1552010601688080457>"
};

const DADOS_PADRAO = {
  canalId: null,
  posts: {},
  cooldowns: {},
  emojis: EMOJIS_PADRAO,
  streaming: {
    canalId: null,
    titulo: "Ao vivo",
    descricao: "",
    link: "",
    mensagemId: null
  }
};

function carregarDados() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      const salvos = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      return {
        ...DADOS_PADRAO,
        ...salvos,
        posts: salvos.posts || {},
        cooldowns: salvos.cooldowns || {},
        emojis: { ...EMOJIS_PADRAO, ...(salvos.emojis || {}) },
        streaming: {
          ...DADOS_PADRAO.streaming,
          ...(salvos.streaming || {})
        }
      };
    }
  } catch (erro) {
    console.error("Erro ao ler data.json:", erro);
  }

  return JSON.parse(JSON.stringify(DADOS_PADRAO));
}

let dados = carregarDados();

function salvarDados() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(dados, null, 2));
  } catch (erro) {
    console.error("Não consegui salvar data.json:", erro);
  }
}

function dono(interaction) {
  return DONOS.includes(interaction.user.id);
}

function emoji(nome) {
  return dados.emojis[nome] || "•";
}

function idEmoji(valor) {
  const encontrado = String(valor).match(/<a?:\w+:(\d+)>|^(\d{15,})$/);
  return encontrado ? encontrado[1] || encontrado[2] : null;
}

function botaoEmoji(customId, nome, texto, estilo = ButtonStyle.Secondary) {
  const botao = new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(texto)
    .setStyle(estilo);

  const id = idEmoji(emoji(nome));
  if (id) botao.setEmoji(id);

  return botao;
}

function temporario(interaction, conteudo) {
  return interaction.reply({
    content: conteudo,
    ephemeral: true
  });
}

// ==================== CLIENTE ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// ==================== COMANDOS ====================

const comandos = [
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configura o canal do feed da Zyphor.")
    .addChannelOption(opcao =>
      opcao
        .setName("canal")
        .setDescription("Canal onde as mídias serão publicadas.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
].map(comando => comando.toJSON());

client.once("ready", async () => {
  console.log(`Zyphor Bot conectado como ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: comandos }
    );
    console.log("Comando /config registrado.");
  } catch (erro) {
    console.error("Erro ao registrar comandos:", erro);
  }

  client.user.setActivity("o feed da Zyphor");
});

// ==================== BOTÕES DO FEED ====================

function botoesFeed(postId, post) {
  const linha = new ActionRowBuilder().addComponents(
    botaoEmoji(
      `like:${postId}`,
      "like",
      `Curtir (${post.likes.length})`,
      post.likes.length ? ButtonStyle.Primary : ButtonStyle.Secondary
    ),
    botaoEmoji(`comment:${postId}`, "cometrio", "Comentar"),
    botaoEmoji(`options:${postId}`, "config", "Opções")
  );

  const linhas = [linha];

  if (post.linkEnabled && post.linkUrl) {
    const link = new ButtonBuilder()
      .setLabel("Abrir link")
      .setStyle(ButtonStyle.Link)
      .setURL(post.linkUrl);

    const id = idEmoji(emoji("link"));
    if (id) link.setEmoji(id);

    linhas.push(new ActionRowBuilder().addComponents(link));
  }

  return linhas;
}

function embedPost(post) {
  const embed = new EmbedBuilder()
    .setColor(0x242424)
    .setAuthor({
      name: post.authorName || "Usuário",
      iconURL: post.authorAvatar || undefined
    })
    .setFooter({ text: `Zyphor Feed • ${post.likes.length} curtida(s)` })
    .setTimestamp(new Date(post.createdAt || Date.now()));

  if (post.description) {
    embed.setDescription(post.description.slice(0, 4000));
  }

  if (post.mediaUrl && post.mediaType?.startsWith("image/")) {
    embed.setImage(post.mediaUrl);
  }

  return embed;
}

// ==================== RECEBER MÍDIAS ====================

client.on("messageCreate", async message => {
  if (!message.guild || message.author.bot) return;
  if (!dados.canalId || message.channel.id !== dados.canalId) return;

  const midia = message.attachments.find(arquivo =>
    arquivo.contentType?.startsWith("image/") ||
    arquivo.contentType?.startsWith("video/")
  );

  if (!midia) {
    try {
      await message.delete();
      const aviso = await message.channel.send({
        content: `${message.author}, este canal aceita somente imagens e vídeos.`
      });
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
    } catch (erro) {
      console.error("Não consegui moderar a mensagem:", erro);
    }
    return;
  }

  const ultimo = Number(dados.cooldowns[message.author.id] || 0);
  const agora = Date.now();

  if (!DONOS.includes(message.author.id) && agora - ultimo < COOLDOWN) {
    const restante = Math.ceil((COOLDOWN - (agora - ultimo)) / 1000);

    try {
      await message.delete();
      const aviso = await message.channel.send({
        content: `${message.author}, aguarde ${Math.ceil(restante / 60)} minuto(s) antes de publicar novamente.`
      });
      setTimeout(() => aviso.delete().catch(() => {}), 5000);
    } catch (erro) {
      console.error("Erro ao aplicar cooldown:", erro);
    }
    return;
  }

  try {
    const post = {
      authorId: message.author.id,
      authorName: message.member?.displayName || message.author.username,
      authorAvatar: message.author.displayAvatarURL(),
      mediaUrl: midia.url,
      mediaType: midia.contentType || "",
      originalChannelId: message.channel.id,
      guildId: message.guild.id,
      likes: [],
      comments: [],
      description: "",
      linkUrl: "",
      linkEnabled: false,
      createdAt: agora
    };

    const publicado = await message.channel.send({
      embeds: [embedPost(post)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("placeholder")
          .setLabel("Preparando publicação…")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )],
      files: midia.contentType?.startsWith("video/")
        ? [new AttachmentBuilder(midia.url, { name: midia.name })]
        : []
    });

    post.mediaUrl = midia.url;
    post.mediaMessageId = publicado.id;
    dados.posts[publicado.id] = post;
    dados.cooldowns[message.author.id] = agora;
    salvarDados();

    await publicado.edit({
      embeds: [embedPost(post)],
      components: botoesFeed(publicado.id, post),
      files: []
    });

    await message.delete().catch(() => {});
  } catch (erro) {
    console.error("Erro ao publicar mídia:", erro);
    try {
      await message.reply("Não consegui publicar essa mídia. Verifique as permissões e o limite de tamanho do Discord.");
    } catch {}
  }
});

// ==================== INTERAÇÕES ====================

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "config") {
        if (!dono(interaction)) {
          return temporario(interaction, "Você não tem permissão para usar este comando.");
        }

        const canal = interaction.options.getChannel("canal", true);
        dados.canalId = canal.id;
        salvarDados();

        const painel = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`settings:${interaction.user.id}`)
            .setLabel("Personalizar emojis")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`feedsettings:${interaction.user.id}`)
            .setLabel("Configurar feed")
            .setStyle(ButtonStyle.Primary)
        );

        try {
          await interaction.user.send({
            content: `Painel privado da Zyphor Bot.\nCanal do feed configurado: <#${canal.id}>.\nUse os botões abaixo para personalizar as opções.`,
            components: [painel]
          });
          return temporario(interaction, `Feed configurado em ${canal}. Enviei o painel na sua DM.`);
        } catch {
          return temporario(interaction, `Feed configurado em ${canal}, mas não consegui enviar a DM. Ative as mensagens diretas para receber o painel.`);
        }
      }
    }

    if (!interaction.isButton()) return;

    const partes = interaction.customId.split(":");
    const acao = partes[0];
    const postId = partes[1];

    if (acao === "settings" || acao === "feedsettings") {
      if (!dono(interaction) || interaction.user.id !== postId) {
        return temporario(interaction, "Este painel pertence a outro dono do bot.");
      }

      if (acao === "settings") {
        const linha = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("emoji:like").setLabel("Curtir").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:cometrio").setLabel("Comentar").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:config").setLabel("Opções").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:link").setLabel("Link").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:lixo").setLabel("Lixo").setStyle(ButtonStyle.Secondary)
        );
        const linha2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("emoji:insta").setLabel("Instagram").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:corao").setLabel("Coração").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:posse").setLabel("Posse").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("emoji:digitar").setLabel("Digitar").setStyle(ButtonStyle.Secondary)
        );

        return interaction.reply({
          content: "Escolha o emoji que deseja alterar. Digite o ID do emoji ou o formato <:nome:id>.",
          components: [linha, linha2],
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`feedmodal:${interaction.user.id}`)
        .setTitle("Configurações do feed");

      const descricao = new TextInputBuilder()
        .setCustomId("descricao")
        .setLabel("Descrição padrão (opcional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000);

      const url = new TextInputBuilder()
        .setCustomId("url")
        .setLabel("Link padrão (opcional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(descricao),
        new ActionRowBuilder().addComponents(url)
      );

      return interaction.showModal(modal);
    }

    if (acao === "emoji") {
      if (!dono(interaction)) {
        return temporario(interaction, "Sem permissão.");
      }

      const nome = postId;
      const modal = new ModalBuilder()
        .setCustomId(`emojimodal:${nome}`)
        .setTitle(`Alterar emoji: ${nome}`);

      const campo = new TextInputBuilder()
        .setCustomId("valor")
        .setLabel("ID numérico ou emoji <:nome:id>")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(dados.emojis[nome] || "");

      modal.addComponents(new ActionRowBuilder().addComponents(campo));
      return interaction.showModal(modal);
    }

    const post = dados.posts[postId];
    if (!post) {
      return temporario(interaction, "Esta publicação não foi encontrada.");
    }

    if (acao === "like") {
      const index = post.likes.indexOf(interaction.user.id);
      if (index >= 0) post.likes.splice(index, 1);
      else post.likes.push(interaction.user.id);

      salvarDados();
      return interaction.update({
        embeds: [embedPost(post)],
        components: botoesFeed(postId, post)
      });
    }

    if (acao === "comment") {
      const modal = new ModalBuilder()
        .setCustomId(`commentmodal:${postId}`)
        .setTitle("Comentar publicação");

      const campo = new TextInputBuilder()
        .setCustomId("texto")
        .setLabel("Seu comentário")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(campo));
      return interaction.showModal(modal);
    }

    if (acao === "options") {
      const linha = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`likes:${postId}:0`).setLabel("Ver curtidas").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`comments:${postId}:0`).setLabel("Ver comentários").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`edit:${postId}`).setLabel("Editar publicação").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`delete:${postId}`).setLabel("Excluir").setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "Opções da publicação:",
        components: [linha],
        ephemeral: true
      });
    }

    if (acao === "likes" || acao === "comments") {
      const pagina = Number(partes[2] || 0);
      const itens = acao === "likes" ? post.likes : post.comments;
      const tamanho = 10;
      const fatia = itens.slice(pagina * tamanho, (pagina + 1) * tamanho);

      let texto;
      if (acao === "likes") {
        const nomes = await Promise.all(fatia.map(async id => {
          const usuario = await client.users.fetch(id).catch(() => null);
          return usuario ? `• ${usuario.username} (<@${id}>)` : `• <@${id}>`;
        }));
        texto = nomes.join("\n") || "Ainda não há curtidas.";
      } else {
        texto = fatia.map(item =>
          `**${item.nome}**: ${item.texto}`
        ).join("\n\n") || "Ainda não há comentários.";
      }

      const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho));
      const botoes = [];

      if (pagina > 0) {
        botoes.push(new ButtonBuilder()
          .setCustomId(`${acao}:${postId}:${pagina - 1}`)
          .setLabel("Anterior")
          .setStyle(ButtonStyle.Secondary));
      }

      if (pagina + 1 < totalPaginas) {
        botoes.push(new ButtonBuilder()
          .setCustomId(`${acao}:${postId}:${pagina + 1}`)
          .setLabel("Próxima")
          .setStyle(ButtonStyle.Secondary));
      }

      const componentes = botoes.length
        ? [new ActionRowBuilder().addComponents(botoes)]
        : [];

      const resposta = {
        content: `**${acao === "likes" ? "Curtidas" : "Comentários"} — página ${pagina + 1}/${totalPaginas}**\n${texto}`.slice(0, 1900),
        components: componentes,
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        return interaction.update({
          content: resposta.content,
          components: resposta.components
        });
      }

      return interaction.reply(resposta);
    }

    if (acao === "edit") {
      if (interaction.user.id !== post.authorId && !dono(interaction)) {
        return temporario(interaction, "Somente o autor ou um dono do bot pode editar esta publicação.");
      }

      const modal = new ModalBuilder()
        .setCustomId(`editmodal:${postId}`)
        .setTitle("Editar publicação");

      const descricao = new TextInputBuilder()
        .setCustomId("descricao")
        .setLabel("Descrição")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(1000)
        .setValue(post.description || "");

      const link = new TextInputBuilder()
        .setCustomId("link")
        .setLabel("URL opcional (https://...)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(500)
        .setValue(post.linkUrl || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(descricao),
        new ActionRowBuilder().addComponents(link)
      );

      return interaction.showModal(modal);
    }

    if (acao === "delete") {
      if (interaction.user.id !== post.authorId && !dono(interaction)) {
        return temporario(interaction, "Somente o autor ou um dono do bot pode excluir esta publicação.");
      }

      const canal = await client.channels.fetch(post.originalChannelId).catch(() => null);
      const mensagem = canal ? await canal.messages.fetch(postId).catch(() => null) : null;

      if (mensagem) await mensagem.delete().catch(() => {});
      delete dados.posts[postId];
      salvarDados();

      return temporario(interaction, "Publicação excluída.");
    }
  } catch (erro) {
    console.error("Erro na interação:", erro);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro. Confira o console da hospedagem.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==================== MODAIS ====================

client.on("interactionCreate", async interaction => {
  if (!interaction.isModalSubmit()) return;

  try {
    const [acao, id] = interaction.customId.split(":");

    if (acao === "commentmodal") {
      const post = dados.posts[id];
      if (!post) return temporario(interaction, "Publicação não encontrada.");

      const texto = interaction.fields.getTextInputValue("texto").trim();
      if (!texto) return temporario(interaction, "O comentário não pode ficar vazio.");

      post.comments.push({
        userId: interaction.user.id,
        nome: interaction.user.username,
        texto,
        createdAt: Date.now()
      });
      salvarDados();

      return temporario(interaction, "Comentário adicionado!");
    }

    if (acao === "editmodal") {
      const post = dados.posts[id];
      if (!post) return temporario(interaction, "Publicação não encontrada.");

      if (interaction.user.id !== post.authorId && !dono(interaction)) {
        return temporario(interaction, "Você não pode editar esta publicação.");
      }

      const descricao = interaction.fields.getTextInputValue("descricao").trim();
      const link = interaction.fields.getTextInputValue("link").trim();

      if (link && !/^https?:\/\/\S+/i.test(link)) {
        return temporario(interaction, "O link deve começar com https:// ou http://.");
      }

      post.description = descricao;
      post.linkUrl = link;
      post.linkEnabled = Boolean(link);
      salvarDados();

      const canal = await client.channels.fetch(post.originalChannelId).catch(() => null);
      const mensagem = canal ? await canal.messages.fetch(id).catch(() => null) : null;

      if (mensagem) {
        await mensagem.edit({
          embeds: [embedPost(post)],
          components: botoesFeed(id, post)
        });
      }

      return temporario(interaction, "Publicação atualizada!");
    }

    if (acao === "emojimodal") {
      if (!dono(interaction)) return temporario(interaction, "Sem permissão.");

      const valor = interaction.fields.getTextInputValue("valor").trim();
      const nome = id;

      if (!idEmoji(valor)) {
        return temporario(interaction, "Não reconheci o ID. Use o ID numérico ou o formato <:nome:id> de um emoji personalizado.");
      }

      dados.emojis[nome] = valor;
      salvarDados();
      return temporario(interaction, `Emoji "${nome}" atualizado.`);
    }

    if (acao === "feedmodal") {
      if (!dono(interaction) || interaction.user.id !== id) {
        return temporario(interaction, "Sem permissão.");
      }

      const descricao = interaction.fields.getTextInputValue("descricao").trim();
      const link = interaction.fields.getTextInputValue("url").trim();

      if (link && !/^https?:\/\/\S+/i.test(link)) {
        return temporario(interaction, "O link deve começar com https:// ou http://.");
      }

      dados.streaming.descricao = descricao;
      dados.streaming.link = link;
      salvarDados();

      return temporario(interaction, "Configurações salvas. Elas ficam disponíveis para usar nas próximas funções do bot.");
    }
  } catch (erro) {
    console.error("Erro ao processar modal:", erro);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Não consegui salvar essa alteração.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==================== COMANDO z!s ====================

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.trim().toLowerCase().startsWith("z!s")) return;

  if (message.author.id !== DONO_ID) {
    await message.reply("Somente o dono principal pode usar este comando.");
    return;
  }

  const link = message.content.trim().split(/\s+/)[1] || dados.streaming.link;

  const embed = new EmbedBuilder()
    .setColor(0x242424)
    .setTitle(dados.streaming.titulo || "Ao vivo")
    .setDescription(
      dados.streaming.descricao ||
      "Acompanhe a transmissão pelo link abaixo."
    );

  const componentes = [];

  if (link && /^https?:\/\/\S+/i.test(link)) {
    componentes.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("Assistir")
        .setStyle(ButtonStyle.Link)
        .setURL(link)
    ));
  }

  await message.channel.send({
    embeds: [embed],
    components: componentes
  });

  await message.delete().catch(() => {});
});

// ==================== INICIALIZAÇÃO ====================

if (!TOKEN) {
  console.error("Configure a variável de ambiente DISCORD_TOKEN na hospedagem.");
} else {
  client.login(TOKEN).catch(erro => {
    console.error("Não consegui iniciar o bot. Confira o DISCORD_TOKEN:", erro.message);
  });
}
