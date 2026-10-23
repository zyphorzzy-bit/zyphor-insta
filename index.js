
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

const OWNER_ID = '1533306874513068093';
const ADMIN_ID = '1541239768010981378';
const GUILD_ID = '1520265564747075746';
const DATA_FILE = path.join(__dirname, 'data.json');

const DEFAULTS = {
  canalId: null,
  cooldowns: {},
  warnings: {},
  emojis: {
    like: '<:like:1552007813709172766>',
    lixo: '<:lixo:1552009637170253894>',
    insta: '<:insta:1552009638487138427>',
    corao: '<:corao:1552010611393700011>',
    link: '<:link:1552009621999452160>',
    posse: '<:posse:1552007807535153262>',
    digitar: '<:digitar:1550347102662434857>',
    cometrio: '<:cometrio:1552009642081788016>',
    config: '<:config:1552010601688080457>'
  },
  moderacao: {
    antiBan: {
      ativo: true,
      cargoProtegidoId: null,
      cargoAutorizadoId: null
    },
    advertencias: {
      '1': { acao: 'warn', duracaoMinutos: 0 },
      '2': { acao: 'timeout', duracaoMinutos: 10 },
      '3': { acao: 'kick', duracaoMinutos: 0 }
    },
    filtros: {
      antiFlood: true,
      antiSpam: true,
      antiGif: false,
      antiSticker: false,
      antiRaid: true,
      antiGrief: false,
      antiLink: false,
      antiDelete: true
    },
    canalLogsId: null,
    linkRecurso: null
  },
  streaming: {
    titulo: 'Ao vivo',
    descricao: '',
    link: 'https://twitch.tv/',
    ativo: false
  }
};

function mergeDefaults(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return structuredClone(base);
  }

  const result = { ...base, ...saved };

  for (const key of Object.keys(base)) {
    if (
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = mergeDefaults(base[key], saved[key]);
    }
  }

  return result;
}

function loadData() {
  try {
    return mergeDefaults(
      DEFAULTS,
      JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    );
  } catch {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(DEFAULTS, null, 2),
      'utf8'
    );

    return structuredClone(DEFAULTS);
  }
}

let data = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

function isOwner(id) {
  return id === OWNER_ID;
}

function isAdmin(id) {
  return id === OWNER_ID || id === ADMIN_ID;
}

function canConfigure(interaction) {
  return (
    isAdmin(interaction.user.id) ||
    interaction.memberPermissions?.has(
      PermissionFlagsBits.Administrator
    )
  );
}

async function replyPrivate(interaction, content) {
  const payload = {
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] }
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function configMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg:area')
      .setPlaceholder('Escolha uma configuração')
      .addOptions(
        { label: 'Canal do feed', value: 'feed' },
        { label: 'Canal de logs', value: 'logs' },
        { label: 'Anti-ban', value: 'antiban' },
        { label: 'Filtros', value: 'filtros' },
        { label: 'Emojis do feed', value: 'emojis' },
        { label: 'Advertências', value: 'warns' },
        { label: 'Link de recurso', value: 'recurso' }
      )
  );
}

function configEmbed() {
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle('Zyphor Bot | Configuração')
    .setDescription(
      'Escolha uma opção no menu abaixo para configurar o bot.\n\n' +
      'Os canais e cargos podem ser selecionados pelos menus.'
    );
}

async function updateStreamingPresence() {
  if (!client.user) return;

  if (!data.streaming.ativo) {
    client.user.setPresence({
      activities: [],
      status: 'online'
    });
    return;
  }

  client.user.setPresence({
    activities: [{
      name: data.streaming.titulo || 'Ao vivo',
      type: ActivityType.Streaming,
      url: data.streaming.link
    }],
    status: 'online'
  });
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Abre o painel de configuração do Zyphor Bot')
    .setDMPermission(false)
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Zyphor Bot online: ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        GUILD_ID
      ),
      { body: commands }
    );

    console.log(
      `Comando /config registrado no servidor ${GUILD_ID}.`
    );
  } catch (error) {
    console.error('Erro ao registrar /config:', error);
  }

  try {
    await updateStreamingPresence();
    console.log('Presença do Zyphor Bot atualizada.');
  } catch (error) {
    console.error('Erro ao atualizar presença:', error);
  }
});
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const lower = content.toLowerCase();

  // Filtros básicos de mensagens.
  const filters = data.moderacao.filtros;
  const member = message.member;

  if (
    member &&
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    const key = `${message.guild.id}:${message.author.id}`;
    const recent = data.cooldowns[key] || [];

    const recentNow = recent.filter(
      time => Date.now() - time < 6000
    );

    recentNow.push(Date.now());
    data.cooldowns[key] = recentNow;

    let violation = '';

    if (filters.antiFlood && recentNow.length >= 6) {
      violation = 'Anti-flood: muitas mensagens em pouco tempo.';
    }

    if (
      filters.antiGif &&
      [...message.attachments.values()].some(
        attachment => attachment.name?.toLowerCase().endsWith('.gif')
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
      try {
        await message.delete();
      } catch {}

      await logAction(
        message.guild,
        `⚠️ ${message.author.tag}: ${violation}`
      );

      saveData();
      return;
    }

    saveData();
  }

  if (!lower.startsWith('c!')) return;

  const args = content.slice(2).trim().split(/\s+/);
  const cmd = (args.shift() || '').toLowerCase();

  if (!cmd) return;

  // Painel privado de streaming.
  if (cmd === 's') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        'Somente o dono principal pode usar c!s.'
      );
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0x6d28d9)
        .setTitle('Zyphor | Painel privado de streaming')
        .setDescription(
          `**Status:** ${data.streaming.ativo ? 'Ativo' : 'Desativado'}\n` +
          `**Título:** ${data.streaming.titulo}\n` +
          `**Descrição:** ${data.streaming.descricao || '—'}\n` +
          `**Link:** ${data.streaming.link}`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('stream:edit')
          .setLabel('Editar streaming')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('stream:toggle')
          .setLabel(data.streaming.ativo ? 'Desativar' : 'Ativar')
          .setStyle(ButtonStyle.Secondary)
      );

      await message.author.send({
        embeds: [embed],
        components: [row]
      });

      await message.reply('Painel enviado no seu privado.');
    } catch {
      await message.reply(
        'Não consegui enviar a DM. Confira as configurações de mensagens diretas.'
      );
    }

    return;
  }

  // Comandos de moderação.
  const commands = [
    'ban',
    'kick',
    'warn',
    'warnings',
    'unwarn',
    'timeout'
  ];

  if (!commands.includes(cmd)) return;

  if (
    !isAdmin(message.author.id) &&
    !member?.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) {
    return message.reply('Você não tem permissão para isso.');
  }

  const target =
    message.mentions.members.first() ||
    message.guild.members.cache.get(
      args[0]?.replace(/[<@!>]/g, '')
    );

  if (!target && !['warnings', 'unwarn'].includes(cmd)) {
    return message.reply(
      `Uso: c!${cmd} @membro motivo`
    );
  }

  if (['warnings', 'unwarn'].includes(cmd) && !target) {
    return message.reply(
      `Uso: c!${cmd} @membro`
    );
  }

  if (target?.id === message.author.id) {
    return message.reply(
      'Você não pode aplicar essa ação em si mesmo.'
    );
  }

  const reason = (args.slice(1).join(' ') || 'Nenhum motivo informado')
    .slice(0, 450);

  const warningKey = target
    ? `${message.guild.id}:${target.id}`
    : null;

  if (cmd === 'warnings') {
    const list = data.warnings[warningKey] || [];

    return message.reply(
      list.length
        ? list.map((warning, index) =>
            `${index + 1}. ${warning.reason} — <@${warning.actor}>`
          ).join('\n')
        : 'Esse membro não tem advertências.'
    );
  }

  if (cmd === 'unwarn') {
    const list = data.warnings[warningKey] || [];

    if (!list.length) {
      return message.reply('Esse membro não tem advertências.');
    }

    list.pop();
    data.warnings[warningKey] = list;
    saveData();

    return message.reply('Advertência mais recente removida.');
  }

  if (cmd === 'ban') {
    if (
      target.id === OWNER_ID ||
      (
        data.moderacao.antiBan.ativo &&
        data.moderacao.antiBan.cargoProtegidoId &&
        target.roles.cache.has(
          data.moderacao.antiBan.cargoProtegidoId
        ) &&
        !canOverrideProtection(member)
      )
    ) {
      return message.reply('Esse membro está protegido pelo anti-ban.');
    }

    if (!target.bannable) {
      return message.reply(
        'Não consigo banir esse membro. Confira a hierarquia de cargos.'
      );
    }

    const embed = new EmbedBuilder()
      .setColor(0xd93025)
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

      await message.reply(`Banido: ${target.user.tag}.`);

      await logAction(
        message.guild,
        `Banimento de ${target.user.tag}\nMotivo: ${reason}`
      );
    } catch (error) {
      await message.reply(`Erro ao banir: ${error.message}`);
    }

    return;
  }

  if (cmd === 'kick') {
    if (!target.kickable) {
      return message.reply('Não consigo expulsar esse membro.');
    }

    await target.kick(reason);
    await message.reply(`Expulso: ${target.user.tag}.`);

    await logAction(
      message.guild,
      `Expulsão de ${target.user.tag}\nMotivo: ${reason}`
    );

    return;
  }

  if (cmd === 'timeout') {
    const minutes = Math.max(
      1,
      Math.min(40320, Number(args[1]) || 10)
    );

    if (!target.moderatable) {
      return message.reply('Não consigo aplicar timeout.');
    }

    await target.timeout(minutes * 60000, reason);

    return message.reply(
      `Timeout aplicado por ${minutes} minuto(s).`
    );
  }

  if (cmd === 'warn') {
    const list = data.warnings[warningKey] || [];

    list.push({
      reason,
      actor: message.author.id,
      at: Date.now()
    });

    data.warnings[warningKey] = list;

    const level = Math.min(3, list.length);
    const rule = data.moderacao.advertencias[String(level)];

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
        (
          !isProtected(target) ||
          canOverrideProtection(member)
        )
      ) {
        await target.ban({ reason });
      }

      await target.send(
        `Você recebeu uma advertência em ${message.guild.name}.\nMotivo: ${reason}`
      ).catch(() => {});
    } catch (error) {
      console.error('Erro na advertência:', error);
    }

    saveData();

    return message.reply(
      `Advertência ${level}/3 registrada para ${target.user.tag}.`
    );
  }
});
client.on('interactionCreate', async interaction => {
  try {
    // Botões do painel privado de streaming.
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('stream:')
    ) {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          content: 'Somente o dono principal pode usar esse painel.',
          ephemeral: true
        });
      }

      if (interaction.customId === 'stream:toggle') {
        data.streaming.ativo = !data.streaming.ativo;
        saveData();

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

        return interaction.reply({
          content: `Streaming ${data.streaming.ativo ? 'ativado' : 'desativado'}.`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'stream:edit') {
        const modal = new ModalBuilder()
          .setCustomId('stream:modal')
          .setTitle('Configurar streaming');

        const titleInput = new TextInputBuilder()
          .setCustomId('stream:title')
          .setLabel('Título do status')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(data.streaming.titulo || 'Zyphor');

        const descriptionInput = new TextInputBuilder()
          .setCustomId('stream:description')
          .setLabel('Descrição')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(150)
          .setValue(data.streaming.descricao || '');

        const linkInput = new TextInputBuilder()
          .setCustomId('stream:link')
          .setLabel('Link do canal Twitch ou YouTube')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(200)
          .setValue(data.streaming.link || '');

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(descriptionInput),
          new ActionRowBuilder().addComponents(linkInput)
        );

        return interaction.showModal(modal);
      }
    }

    // Salvar formulário de streaming.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'stream:modal'
    ) {
      if (!isOwner(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização.',
          ephemeral: true
        });
      }

      const title = interaction.fields.getTextInputValue('stream:title');
      const description = interaction.fields.getTextInputValue('stream:description');
      const link = interaction.fields.getTextInputValue('stream:link').trim();

      let parsedUrl;

      try {
        parsedUrl = new URL(link);
      } catch {
        return interaction.reply({
          content: 'Informe um link válido da Twitch ou do YouTube.',
          ephemeral: true
        });
      }

      const host = parsedUrl.hostname.toLowerCase();

      if (
        !['twitch.tv', 'www.twitch.tv', 'youtube.com',
          'www.youtube.com', 'm.youtube.com', 'youtu.be']
          .includes(host)
      ) {
        return interaction.reply({
          content: 'Use um link da Twitch ou do YouTube.',
          ephemeral: true
        });
      }

      data.streaming.titulo = title;
      data.streaming.descricao = description;
      data.streaming.link = parsedUrl.toString();

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

    // Comando slash /config.
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'config'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização para abrir este painel.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x202020)
        .setTitle('ZYPhor | Configuração')
        .setDescription(
          'Selecione a área que deseja configurar.\n\n' +
          '📢 Feed e canais\n' +
          '🛡️ Segurança e moderação\n' +
          '🧰 Cargos e permissões\n' +
          '📋 Logs\n' +
          '⚙️ Outras configurações'
        );

      const menu = new StringSelectMenuBuilder()
        .setCustomId('config:area')
        .setPlaceholder('Escolha uma área')
        .addOptions(
          {
            label: 'Canais',
            description: 'Configurar canais do servidor',
            value: 'channels',
            emoji: '📢'
          },
          {
            label: 'Segurança',
            description: 'Consultar opções de segurança',
            value: 'security',
            emoji: '🛡️'
          },
          {
            label: 'Cargos',
            description: 'Configurar cargos autorizados',
            value: 'roles',
            emoji: '🧰'
          },
          {
            label: 'Logs',
            description: 'Configurar canal de registros',
            value: 'logs',
            emoji: '📋'
          }
        );

      return interaction.reply({
        embeds: [embed],
        components: [
          new ActionRowBuilder().addComponents(menu)
        ],
        ephemeral: true
      });
    }

    // Seleções do painel.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'config:area'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização.',
          ephemeral: true
        });
      }

      if (interaction.values[0] === 'channels') {
        const channelMenu = new ChannelSelectMenuBuilder()
          .setCustomId('config:channels')
          .setPlaceholder('Selecione o canal')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.update({
          content: 'Selecione o canal que deseja configurar.',
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(channelMenu)
          ]
        });
      }

      if (interaction.values[0] === 'logs') {
        const channelMenu = new ChannelSelectMenuBuilder()
          .setCustomId('config:logs')
          .setPlaceholder('Selecione o canal de logs')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.update({
          content: 'Escolha o canal de logs.',
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(channelMenu)
          ]
        });
      }

      if (interaction.values[0] === 'roles') {
        const roleMenu = new RoleSelectMenuBuilder()
          .setCustomId('config:roles')
          .setPlaceholder('Selecione um cargo autorizado')
          .setMinValues(1)
          .setMaxValues(1);

        return interaction.update({
          content: 'Escolha o cargo autorizado.',
          embeds: [],
          components: [
            new ActionRowBuilder().addComponents(roleMenu)
          ]
        });
      }

      if (interaction.values[0] === 'security') {
        return interaction.update({
          content:
            'As opções de segurança dependem dos filtros definidos na configuração do bot.',
          embeds: [],
          components: []
        });
      }
    }

    // Salvar canal escolhido.
    if (
      interaction.isChannelSelectMenu() &&
      ['config:channels', 'config:logs'].includes(interaction.customId)
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização.',
          ephemeral: true
        });
      }

      const channelId = interaction.values[0];

      if (interaction.customId === 'config:logs') {
        data.canais.logs = channelId;
      } else {
        data.canais.feed = channelId;
      }

      saveData();

      return interaction.update({
        content: 'Canal salvo com sucesso.',
        embeds: [],
        components: []
      });
    }

    // Salvar cargo escolhido.
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId === 'config:roles'
    ) {
      if (!isAdmin(interaction.user.id)) {
        return interaction.reply({
          content: 'Você não tem autorização.',
          ephemeral: true
        });
      }

      data.moderacao.antiBan.cargoProtegidoId =
        interaction.values[0];

      saveData();

      return interaction.update({
        content: 'Cargo protegido salvo.',
        embeds: [],
        components: []
      });
    }
  } catch (error) {
    console.error('Erro em interactionCreate:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocorreu um erro ao processar essa interação.',
        ephemeral: true
      }).catch(() => {});
    }
  }
});
