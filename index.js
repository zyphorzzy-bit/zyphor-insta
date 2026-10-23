
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  PermissionFlagsBits,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

// ================= CONFIGURAÇÃO =================

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = '1520265564747075746';

const OWNER_ID = '1533306874513068093';
const ADMIN_IDS = [
  OWNER_ID,
  '1541239768010981378'
];

const DATA_FILE = path.join(__dirname, 'data.json');

if (!TOKEN) {
  console.error('ERRO: configure a variável DISCORD_TOKEN na hospedagem.');
  process.exit(1);
}

// ================= DADOS =================

const DEFAULTS = {
  canais: {
    logs: null,
    feed: null
  },
  moderacao: {
    antiBan: {
      ativo: true,
      cargoProtegidoId: null
    },
    filtros: {
      antiFlood: false,
      antiGif: false,
      antiSticker: false,
      antiLink: false
    },
    linkRecurso: '',
    advertencias: {
      '1': { acao: 'none', duracaoMinutos: 10 },
      '2': { acao: 'timeout', duracaoMinutos: 10 },
      '3': { acao: 'timeout', duracaoMinutos: 60 }
    }
  },
  warnings: {},
  cooldowns: {},
  streaming: {
    ativo: false,
    titulo: 'Zyphor',
    descricao: '',
    link: ''
  }
};

function mergeDefaults(defaults, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return structuredClone(defaults);
  }

  const result = { ...defaults };

  for (const key of Object.keys(saved)) {
    if (
      saved[key] &&
      typeof saved[key] === 'object' &&
      !Array.isArray(saved[key]) &&
      defaults[key] &&
      typeof defaults[key] === 'object' &&
      !Array.isArray(defaults[key])
    ) {
      result[key] = mergeDefaults(defaults[key], saved[key]);
    } else {
      result[key] = saved[key];
    }
  }

  return result;
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return mergeDefaults(
        DEFAULTS,
        JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
      );
    }
  } catch (error) {
    console.error('Erro ao ler data.json:', error.message);
  }

  return structuredClone(DEFAULTS);
}

let data = loadData();

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Erro ao salvar data.json:', error.message);
  }
}

// ================= CLIENTE =================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.GuildMember
  ]
});

function isOwner(id) {
  return id === OWNER_ID;
}

function isAdmin(id) {
  return ADMIN_IDS.includes(id);
}

function canModerate(member) {
  return Boolean(
    member &&
    (
      isAdmin(member.id) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      member.permissions.has(PermissionFlagsBits.Administrator)
    )
  );
}

function isProtected(member) {
  const roleId = data.moderacao.antiBan.cargoProtegidoId;

  return Boolean(
    data.moderacao.antiBan.ativo &&
    roleId &&
    member.roles.cache.has(roleId)
  );
}

function canOverrideProtection(member) {
  return Boolean(
    member &&
    (
      isOwner(member.id) ||
      member.permissions.has(PermissionFlagsBits.Administrator)
    )
  );
}

async function logAction(guild, message) {
  const channelId = data.canais.logs;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({
    content: message,
    allowedMentions: { parse: [] }
  }).catch(() => {});
}

function getTarget(message, value) {
  const mentioned = message.mentions.members.first();
  if (mentioned) return mentioned;

  const id = String(value || '').replace(/[<@!>]/g, '');
  return message.guild.members.cache.get(id) || null;
}

// ================= COMANDO /CONFIG =================

const slashCommands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Abre o painel de configuração do Zyphor Bot')
    .setDMPermission(false)
    .toJSON()
];

// ================= BOT ONLINE =================

client.once('ready', async () => {
  console.log(`Conectado como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, GUILD_ID),
      { body: slashCommands }
    );

    console.log('Comando /config registrado no servidor.');
  } catch (error) {
    console.error('Erro ao registrar /config:', error);
  }

  if (data.streaming.ativo && data.streaming.link) {
    client.user.setPresence({
      activities: [{
        name: data.streaming.titulo || 'Zyphor',
        type: ActivityType.Streaming,
        url: data.streaming.link
      }],
      status: 'online'
    });
  } else {
    client.user.setPresence({
      activities: [],
      status: 'online'
    });
  }
});

// ================= COMANDOS DE TEXTO =================

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const member = message.member;
  const filters = data.moderacao.filtros;

  // Filtros básicos.
  if (
    member &&
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    const key = `${message.guild.id}:${message.author.id}`;
    const recent = (data.cooldowns[key] || [])
      .filter(time => Date.now() - time < 6000);

    recent.push(Date.now());
    data.cooldowns[key] = recent;

    let violation = '';

    if (filters.antiFlood && recent.length >= 6) {
      violation = 'Muitas mensagens em pouco tempo.';
    }

    if (
      filters.antiGif &&
      [...message.attachments.values()].some(a =>
        a.name?.toLowerCase().endsWith('.gif')
      )
    ) {
      violation = 'GIFs não são permitidos.';
    }

    if (filters.antiSticker && message.stickers.size > 0) {
      violation = 'Figurinhas não são permitidas.';
    }

    if (
      filters.antiLink &&
      /(https?:\/\/|discord\.gg\/)/i.test(content)
    ) {
      violation = 'Links não são permitidos.';
    }

    if (violation) {
      await message.delete().catch(() => {});
      await logAction(
        message.guild,
        `Filtro acionado por ${message.author.tag}: ${violation}`
      );
      saveData();
      return;
    }

    saveData();
  }

  if (!content.toLowerCase().startsWith('c!')) return;

  const parts = content.slice(2).trim().split(/\s+/);
  const command = (parts.shift() || '').toLowerCase();

  // c!s: painel de streaming somente na DM do dono principal.
  if (command === 's') {
    if (!isOwner(message.author.id)) {
      return message.reply('Somente o dono principal pode usar c!s.');
    }

    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setTitle('Zyphor | Streaming privado')
      .setDescription(
        `**Status:** ${data.streaming.ativo ? 'Ativo' : 'Desativado'}\n` +
        `**Título:** ${data.streaming.titulo}\n` +
        `**Link:** ${data.streaming.link || 'Não configurado'}`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('stream:edit')
        .setLabel('Editar')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('stream:toggle')
        .setLabel(data.streaming.ativo ? 'Desativar' : 'Ativar')
        .setStyle(ButtonStyle.Secondary)
    );

    try {
      await message.author.send({
        embeds: [embed],
        components: [row]
      });
      await message.reply('Enviei o painel no seu privado.');
    } catch {
      await message.reply(
        'Não consegui enviar a DM. Ative mensagens diretas para o bot.'
      );
    }
    return;
  }

  const supported = [
    'ban', 'kick', 'warn', 'warnings', 'unwarn', 'timeout'
  ];

  if (!supported.includes(command)) return;

  if (!canModerate(member)) {
    return message.reply('Você não tem permissão para esse comando.');
  }

  const target = getTarget(message, parts[0]);

  if (!target) {
    return message.reply(`Uso: c!${command} @membro motivo`);
  }

  if (target.id === message.author.id) {
    return message.reply('Você não pode aplicar essa ação em si mesmo.');
  }

  const reason = (
    parts.slice(1).join(' ') || 'Nenhum motivo informado'
  ).slice(0, 450);

  const warningKey = `${message.guild.id}:${target.id}`;

  if (command === 'warnings') {
    const list = data.warnings[warningKey] || [];

    return message.reply(
      list.length
        ? list.map((w, i) =>
            `${i + 1}. ${w.reason} — moderador ID ${w.actor}`
          ).join('\n')
        : 'Esse membro não tem advertências.'
    );
  }

  if (command === 'unwarn') {
    const list = data.warnings[warningKey] || [];

    if (!list.length) {
      return message.reply('Esse membro não tem advertências.');
    }

    list.pop();
    data.warnings[warningKey] = list;
    saveData();

    return message.reply('Última advertência removida.');
  }

  if (command === 'ban') {
    if (
      (isProtected(target) && !canOverrideProtection(member)) ||
      (target.id === OWNER_ID && !isOwner(message.author.id))
    ) {
      return message.reply('Esse membro está protegido.');
    }

    if (!target.bannable) {
      return message.reply(
        'Não consigo banir esse membro. Confira a hierarquia de cargos.'
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xdc2626)
      .setTitle(`Banimento — ${message.guild.name}`)
      .setDescription(
        `**Motivo:** ${reason}\n` +
        `**Moderador:** ${message.author.tag}\n` +
        `**Data:** ${new Date().toLocaleString('pt-BR')}\n` +
        `**Recurso:** ${data.moderacao.linkRecurso || 'Não configurado'}`
      );

    await target.send({ embeds: [embed] }).catch(() => {});

    try {
      await target.ban({ reason });
      await message.reply(`Membro banido: ${target.user.tag}.`);
      await logAction(
        message.guild,
        `Banimento: ${target.user.tag}. Motivo: ${reason}`
      );
    } catch (error) {
      await message.reply(`Falha ao banir: ${error.message}`);
    }
    return;
  }

  if (command === 'kick') {
    if (!target.kickable) {
      return message.reply('Não consigo expulsar esse membro.');
    }

    try {
      await target.kick(reason);
      await message.reply(`Membro expulso: ${target.user.tag}.`);
      await logAction(
        message.guild,
        `Expulsão: ${target.user.tag}. Motivo: ${reason}`
      );
    } catch (error) {
      await message.reply(`Falha ao expulsar: ${error.message}`);
    }
    return;
  }

  if (command === 'timeout') {
    const minutes = Math.max(1, Math.min(40320, Number(parts[1]) || 10));

    if (!target.moderatable) {
      return message.reply('Não consigo aplicar timeout nesse membro.');
    }

    try {
      await target.timeout(minutes * 60000, reason);
      await message.reply(`Timeout aplicado por ${minutes} minuto(s).`);
      await logAction(
        message.guild,
        `Timeout: ${target.user.tag} por ${minutes} minuto(s).`
      );
    } catch (error) {
      await message.reply(`Falha ao aplicar timeout: ${error.message}`);
    }
    return;
  }

  if (command === 'warn') {
    const list = data.warnings[warningKey] || [];

    list.push({
      reason,
      actor: message.author.id,
      at: Date.now()
    });

    data.warnings[warningKey] = list;

    const level = Math.min(3, list.length);
    const rule = data.moderacao.advertencias[String(level)] || {
      acao: 'none',
      duracaoMinutos: 10
    };

    try {
      if (rule.acao === 'timeout' && target.moderatable) {
        await target.timeout(
          Math.max(1, rule.duracaoMinutos || 10) * 60000,
          reason
        );
      } else if (rule.acao === 'kick' && target.kickable) {
        await target.kick(reason);
      } else if (
        rule.acao === 'ban' &&
        target.bannable &&
        (!isProtected(target) || canOverrideProtection(member))
      ) {
        await target.ban({ reason });
      }

      await target.send(
        `Você recebeu uma advertência em ${message.guild.name}.\nMotivo: ${reason}`
      ).catch(() => {});

      saveData();
      await message.reply(
        `Advertência ${level}/3 registrada para ${target.user.tag}.`
      );
      await logAction(
        message.guild,
        `Advertência ${level}/3 para ${target.user.tag}: ${reason}`
      );
    } catch (error) {
      saveData();
      await message.reply(
        `Advertência salva, mas houve um erro na ação automática: ${error.message}`
      );
    }
  }
});

// ================= INTERAÇÕES =================

client.on('interactionCreate', async interaction => {
  try {
    // Painel /config.
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'config'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização para abrir esse painel.',
          ephemeral: true
        });
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('config:area')
        .setPlaceholder('Escolha o que configurar')
        .addOptions(
          { label: 'Canal de logs', value: 'logs', emoji: '📋' },
          { label: 'Canal do feed', value: 'feed', emoji: '📢' },
          { label: 'Cargo protegido', value: 'protected', emoji: '🛡️' },
          { label: 'Filtros', value: 'filters', emoji: '⚙️' }
        );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x202020)
            .setTitle('ZYPhor | Configuração')
            .setDescription('Escolha uma opção no menu abaixo.')
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      });
    }

    // Seleção de área do painel.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'config:area'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Sem autorização.',
          ephemeral: true
        });
      }

      const selected = interaction.values[0];

      if (selected === 'logs' || selected === 'feed') {
        const menu = new ChannelSelectMenuBuilder()
          .setCustomId(`config:channel:${selected}`)
          .setPlaceholder('Selecione um canal de texto')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.update({
          content: 'Escolha o canal no seletor abaixo.',
          embeds: [],
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }

      if (selected === 'protected') {
        const menu = new RoleSelectMenuBuilder()
          .setCustomId('config:role:protected')
          .setPlaceholder('Selecione o cargo protegido')
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.update({
          content: 'Escolha o cargo protegido.',
          embeds: [],
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }

      if (selected === 'filters') {
        const filters = data.moderacao.filtros;

        const menu = new StringSelectMenuBuilder()
          .setCustomId('config:filter')
          .setPlaceholder('Ativar ou desativar um filtro')
          .addOptions(
            {
              label: `Anti-flood: ${filters.antiFlood ? 'Ligado' : 'Desligado'}`,
              value: 'antiFlood'
            },
            {
              label: `Anti-GIF: ${filters.antiGif ? 'Ligado' : 'Desligado'}`,
              value: 'antiGif'
            },
            {
              label: `Anti-figurinhas: ${filters.antiSticker ? 'Ligado' : 'Desligado'}`,
              value: 'antiSticker'
            },
            {
              label: `Anti-link: ${filters.antiLink ? 'Ligado' : 'Desligado'}`,
              value: 'antiLink'
            }
          );

        return interaction.update({
          content: 'Selecione um filtro para alternar o estado.',
          embeds: [],
          components: [new ActionRowBuilder().addComponents(menu)]
        });
      }
    }

    // Alternar filtro.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'config:filter'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Sem autorização.',
          ephemeral: true
        });
      }

      const key = interaction.values[0];

      if (!Object.hasOwn(data.moderacao.filtros, key)) {
        return interaction.reply({
          content: 'Filtro desconhecido.',
          ephemeral: true
        });
      }

      data.moderacao.filtros[key] = !data.moderacao.filtros[key];
      saveData();

      return interaction.update({
        content: `${key}: ${data.moderacao.filtros[key] ? 'ativado' : 'desativado'}.`,
        embeds: [],
        components: []
      });
    }

    // Salvar canal.
    if (
      interaction.isChannelSelectMenu() &&
      interaction.customId.startsWith('config:channel:')
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Sem autorização.',
          ephemeral: true
        });
      }

      const destination = interaction.customId.split(':')[2];
      const channelId = interaction.values[0];

      if (destination === 'logs') {
        data.canais.logs = channelId;
      } else if (destination === 'feed') {
        data.canais.feed = channelId;
      }

      saveData();

      return interaction.update({
        content: `Canal de ${destination} salvo.`,
        embeds: [],
        components: []
      });
    }

    // Salvar cargo protegido.
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId === 'config:role:protected'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Sem autorização.',
          ephemeral: true
        });
      }

      data.moderacao.antiBan.cargoProtegidoId = interaction.values[0];
      saveData();

      return interaction.update({
        content: 'Cargo protegido salvo.',
        embeds: [],
        components: []
      });
    }

    // Botões do streaming.
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('stream:')
    ) {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          content: 'Somente o dono principal pode usar c!s.',
          ephemeral: true
        });
      }

      if (interaction.customId === 'stream:toggle') {
        if (!data.streaming.link) {
          return interaction.reply({
            content: 'Configure primeiro o link usando Editar.',
            ephemeral: true
          });
        }

        data.streaming.ativo = !data.streaming.ativo;
        saveData();

        client.user.setPresence(
          data.streaming.ativo
            ? {
                activities: [{
                  name: data.streaming.titulo || 'Zyphor',
                  type: ActivityType.Streaming,
                  url: data.streaming.link
                }],
                status: 'online'
              }
            : {
                activities: [],
                status: 'online'
              }
        );

        return interaction.reply({
          content: `Streaming ${data.streaming.ativo ? 'ativado' : 'desativado'}.`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'stream:edit') {
        const modal = new ModalBuilder()
          .setCustomId('stream:modal')
          .setTitle('Editar streaming');

        const title = new TextInputBuilder()
          .setCustomId('stream:title')
          .setLabel('Título')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(data.streaming.titulo || 'Zyphor');

        const description = new TextInputBuilder()
          .setCustomId('stream:description')
          .setLabel('Descrição (opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(150)
          .setValue(data.streaming.descricao || '');

        const link = new TextInputBuilder()
          .setCustomId('stream:link')
          .setLabel('Link Twitch ou YouTube')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setValue(data.streaming.link || '');

        modal.addComponents(
          new ActionRowBuilder().addComponents(title),
          new ActionRowBuilder().addComponents(description),
          new ActionRowBuilder().addComponents(link)
        );

        return interaction.showModal(modal);
      }
    }

    // Salvar modal de streaming.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'stream:modal'
    ) {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          content: 'Sem autorização.',
          ephemeral: true
        });
      }

      const title = interaction.fields.getTextInputValue('stream:title');
      const description = interaction.fields.getTextInputValue('stream:description');
      const link = interaction.fields.getTextInputValue('stream:link').trim();

      let url;

      try {
        url = new URL(link);
      } catch {
        return interaction.reply({
          content: 'O link informado não é válido.',
          ephemeral: true
        });
      }

      const host = url.hostname.toLowerCase();
      const allowedHosts = [
        'twitch.tv',
        'www.twitch.tv',
        'youtube.com',
        'www.youtube.com',
        'm.youtube.com',
        'youtu.be'
      ];

      if (url.protocol !== 'https:' || !allowedHosts.includes(host)) {
        return interaction.reply({
          content: 'Use um link HTTPS válido da Twitch ou do YouTube.',
          ephemeral: true
        });
      }

      data.streaming.titulo = title;
      data.streaming.descricao = description;
      data.streaming.link = url.toString();
      saveData();

      if (data.streaming.ativo) {
        client.user.setPresence({
          activities: [{
            name: title,
            type: ActivityType.Streaming,
            url: data.streaming.link
          }],
          status: 'online'
        });
      }

      return interaction.reply({
        content: 'Configurações do streaming salvas.',
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Erro na interação:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Erro ao processar. Confira o console da hospedagem.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ================= ERROS E LOGIN =================

process.on('unhandledRejection', error => {
  console.error('Promise rejeitada:', error);
});

process.on('uncaughtException', error => {
  console.error('Erro inesperado:', error);
});

client.login(TOKEN);
