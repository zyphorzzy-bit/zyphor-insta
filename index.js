
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
const DATA_FILE = path.join(__dirname, 'data.json');

const DEFAULTS = {
  canalId: null,
  posts: {},
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
    emojisFixos: {
      ban: '<:ban:1552761935945277472>',
      seguranca: '<:security:1552010618163167306>',
      escudo: '<:escudo:1552508771228450856>',
      alerta: '<a:alerta:1552007804569653360>',
      warn1: '<:warn1:1550347449925894196>',
      warn2: '<:warn2:1550347452446408754>',
      warn3: '<:warn3:1550347451070943254>',
      aceito: '<:aceito:1552508777943539843>',
      recusado: '<:recusado:1552508774462398484>',
      proibido: '<:proibido:1552010616280064092>',
      protecao: '<:Secured:1550347097318883360>'
    },
    antiBan: {
      ativo: true,
      cargoProtegidoId: null,
      cargoAutorizadoId: null
    },
    advertencias: {
      '1': {
        cargoId: null,
        acao: 'warn',
        duracaoMinutos: 0
      },
      '2': {
        cargoId: null,
        acao: 'timeout',
        duracaoMinutos: 10
      },
      '3': {
        cargoId: null,
        acao: 'kick',
        duracaoMinutos: 0
      }
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
  painel: {
    canalConfigId: null,
    mensagemConfigId: null
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

  const out = { ...base, ...saved };

  for (const key of Object.keys(base)) {
    if (
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      out[key] = mergeDefaults(base[key], saved[key]);
    }
  }

  return out;
}

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    'utf8'
  );
}

function loadData() {
  try {
    return mergeDefaults(
      DEFAULTS,
      JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    );
  } catch {
    const initial = structuredClone(DEFAULTS);
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(initial, null, 2),
      'utf8'
    );
    return initial;
  }
}

let data = loadData();

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

function safeReason(text) {
  return (text || 'Nenhum motivo informado').slice(0, 450);
}

function parseTarget(message) {
  return (
    message.mentions.members.first() ||
    message.guild.members.cache.get(
      message.content.split(/\s+/)[1]?.replace(/[<@!>]/g, '')
    )
  );
}

function isProtected(target) {
  const cfg = data.moderacao.antiBan;

  return Boolean(
    cfg.ativo &&
    cfg.cargoProtegidoId &&
    target.roles.cache.has(cfg.cargoProtegidoId)
  );
}

function canOverrideProtection(member) {
  const roleId = data.moderacao.antiBan.cargoAutorizadoId;

  return (
    member?.id === OWNER_ID ||
    Boolean(roleId && member?.roles?.cache?.has(roleId))
  );
}

async function logAction(guild, text) {
  const channelId = data.moderacao.canalLogsId;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6d28d9)
          .setDescription(text)
      ],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error('Falha ao registrar log:', error.message);
  }
}

async function replyEphemeral(interaction, content) {
  const payload = {
    content,
    allowedMentions: { parse: [] },
    flags: MessageFlags.Ephemeral
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload);
  }

  return interaction.reply(payload);
}

function configEmbed() {
  return new EmbedBuilder()
    .setColor(0x6d28d9)
    .setTitle('Zyphor Bot • Configuração')
    .setDescription([
      'Selecione uma área no menu abaixo.',
      '',
      '• Canal do feed',
      '• Canal de logs',
      '• Anti-ban e cargos protegidos',
      '• Filtros de mensagens',
      '• Emojis do Instagram',
      '• Advertências e punições',
      '• Link de recurso de banimento',
      '',
      'Os canais e cargos são selecionados nos menus.'
    ].join('\n'));
}

function configMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg:area')
      .setPlaceholder('Escolha uma área')
      .addOptions(
        {
          label: 'Canal do feed',
          value: 'feed'
        },
        {
          label: 'Canal de logs',
          value: 'logs'
        },
        {
          label: 'Anti-ban',
          value: 'antiban'
        },
        {
          label: 'Filtros',
          value: 'filtros'
        },
        {
          label: 'Emojis do Instagram',
          value: 'emojis'
        },
        {
          label: 'Advertências',
          value: 'warns'
        },
        {
          label: 'Mensagem de banimento',
          value: 'banmsg'
        }
      )
  );
}

function toggleFilterMenu() {
  const filters = data.moderacao.filtros;

  const labels = {
    antiFlood: 'Anti-flood',
    antiSpam: 'Anti-spam',
    antiGif: 'Anti-GIF',
    antiSticker: 'Anti-sticker',
    antiRaid: 'Anti-raid',
    antiGrief: 'Anti-grief',
    antiLink: 'Anti-link',
    antiDelete: 'Registro de exclusões'
  };

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cfg:togglefilter')
      .setPlaceholder('Selecione um filtro')
      .addOptions(
        Object.entries(labels).map(([value, label]) => ({
          label: `${filters[value] ? '🟢' : '⚪'} ${label}`,
          value,
          description: filters[value]
            ? 'Atualmente ativado'
            : 'Atualmente desativado'
        }))
      )
  );
}

function emojisText() {
  return Object.entries(data.emojis)
    .map(([key, value]) => `**${key}** — ${value}`)
    .join('\n');
}

async function updateStreamingPresence() {
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
      url: data.streaming.link || 'https://twitch.tv/'
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
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

const slashCommands = [
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Abre o painel do Zyphor Bot')
    .setDefaultMemberPermissions(
      PermissionFlagsBits.Administrator
    )
    .setDMPermission(false)
].map(command => command.toJSON());

client.once('ready', async () => {
  console.log(`Zyphor Bot conectado como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands }
    );

    console.log('/config registrado.');
  } catch (error) {
    console.error('Erro registrando /config:', error.message);
  }

  await updateStreamingPresence().catch(console.error);
});
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const prefix = 'c!';
  const content = message.content.trim();
  const lower = content.toLowerCase();

  // Sistema básico de feed para mídias.
  if (
    data.canalId &&
    message.channel.id === data.canalId &&
    message.attachments.size
  ) {
    try {
      const files = [];

      for (const attachment of message.attachments.values()) {
        const type = attachment.contentType || '';

        if (
          !type.startsWith('image/') &&
          !type.startsWith('video/')
        ) continue;

        const response = await fetch(attachment.url);

        if (!response.ok) {
          throw new Error('Não foi possível baixar a mídia.');
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        files.push({
          attachment: buffer,
          name: (attachment.name || 'upload.bin')
            .replace(/[^\w.-]/g, '_')
        });
      }

      if (files.length) {
        const embed = new EmbedBuilder()
          .setColor(0x6d28d9)
          .setAuthor({
            name: message.author.username,
            iconURL: message.author.displayAvatarURL()
          })
          .setDescription(`Publicado por <@${message.author.id}>`)
          .setTimestamp();

        const imageFile = files.find(file =>
          /\.(png|jpe?g|webp)$/i.test(file.name)
        );

        if (imageFile) {
          embed.setImage(`attachment://${imageFile.name}`);
        }

        await message.channel.send({
          embeds: [embed],
          files,
          allowedMentions: { parse: [] }
        });
      }
    } catch (error) {
      console.error('Erro no feed:', error.message);

      try {
        await message.reply(
          'Não consegui publicar a mídia. A mensagem original foi mantida.'
        );
      } catch {}
    }
  }

  // Filtros básicos.
  const filters = data.moderacao.filtros;
  const member = message.member;

  if (
    member &&
    !member.permissions.has(PermissionFlagsBits.ManageMessages)
  ) {
    const key = `${message.guild.id}:${message.author.id}`;
    const recent = data.cooldowns[key] || [];

    const recentNow = recent.filter(
      timestamp => Date.now() - timestamp < 6000
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

  if (!lower.startsWith(prefix)) return;

  const args = content
    .slice(prefix.length)
    .trim()
    .split(/\s+/);

  const cmd = (args.shift() || '').toLowerCase();

  if (!cmd) return;

  // Painel privado de streaming: somente o dono principal.
  if (cmd === 's') {
    if (!isOwner(message.author.id)) {
      return message.reply(
        'Somente o dono principal pode usar `c!s`.'
      );
    }

    try {
      const dm = await message.author.createDM();

      const embed = new EmbedBuilder()
        .setColor(0x6d28d9)
        .setTitle('Zyphor • Painel privado de streaming')
        .setDescription(
          `**Ativo:** ${data.streaming.ativo ? 'Sim' : 'Não'}\n` +
          `**Título:** ${data.streaming.titulo}\n` +
          `**Descrição:** ${data.streaming.descricao || '—'}\n` +
          `**Link:** ${data.streaming.link}`
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('stream:edit')
          .setLabel('Editar dados')
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId('stream:toggle')
          .setLabel(data.streaming.ativo ? 'Desativar' : 'Ativar')
          .setStyle(ButtonStyle.Secondary)
      );

      await dm.send({
        embeds: [embed],
        components: [row]
      });

      await message.reply('Enviei o painel no seu privado.');
    } catch {
      await message.reply(
        'Não consegui abrir seu privado. Confira as configurações de mensagens diretas.'
      );
    }

    return;
  }

  if (cmd === 'config') {
    if (!isAdmin(message.author.id)) {
      return message.reply('Você não tem acesso a esse comando.');
    }

    return message.reply('Use `/config` para abrir o painel.');
  }

  const moderationCommands = [
    'ban',
    'kick',
    'warn',
    'warnings',
    'unwarn',
    'timeout'
  ];

  if (!moderationCommands.includes(cmd)) return;

  if (
    !isAdmin(message.author.id) &&
    !member?.permissions.has(PermissionFlagsBits.ModerateMembers)
  ) {
    return message.reply(
      'Você não tem permissão para usar esse comando.'
    );
  }

  // Consultar advertências.
  if (cmd === 'warnings') {
    const target = parseTarget(message);

    if (!target) {
      return message.reply('Uso: `c!warnings @membro`');
    }

    const key = `${message.guild.id}:${target.id}`;
    const list = data.warnings[key] || [];

    if (!list.length) {
      return message.reply(
        'Esse membro não tem advertências registradas.'
      );
    }

    const description = list.map((warning, index) =>
      `${index + 1}. ${warning.reason} — ` +
      `<@${warning.actor}> — ` +
      `<t:${Math.floor(warning.at / 1000)}:R>`
    ).join('\n');

    return message.reply({
      content:
        `Advertências de **${target.user.tag}**:\n${description}`,
      allowedMentions: { parse: [] }
    });
  }

  // Remover a advertência mais recente.
  if (cmd === 'unwarn') {
    const target = parseTarget(message);

    if (!target) {
      return message.reply('Uso: `c!unwarn @membro`');
    }

    const key = `${message.guild.id}:${target.id}`;
    const list = data.warnings[key] || [];

    if (!list.length) {
      return message.reply('Esse membro não tem advertências.');
    }

    list.pop();
    data.warnings[key] = list;
    saveData();

    return message.reply(
      `Removi a advertência mais recente de ${target.user.tag}.`
    );
  }

  const target = parseTarget(message);

  if (!target) {
    return message.reply(`Uso: \`c!${cmd} @membro motivo\``);
  }

  if (target.id === message.author.id) {
    return message.reply(
      'Você não pode aplicar essa ação em si mesmo.'
    );
  }

  if (
    target.id === OWNER_ID &&
    message.author.id !== OWNER_ID
  ) {
    return message.reply('Esse membro está protegido.');
  }

  const reason = safeReason(args.slice(1).join(' '));

  // Banimento.
  if (cmd === 'ban') {
    if (
      isProtected(target) &&
      !canOverrideProtection(member)
    ) {
      return message.reply(
        'Esse membro possui um cargo protegido pelo anti-ban.'
      );
    }

    if (!target.bannable) {
      return message.reply(
        'Não consigo banir esse membro. Confira minhas permissões e a hierarquia de cargos.'
      );
    }

    try {
      const banEmbed = new EmbedBuilder()
        .setColor(0xd93025)
        .setTitle(`Banimento — ${message.guild.name}`)
        .setDescription(
          `**Motivo:** ${reason}\n` +
          `**Moderador:** ${message.author.tag}\n` +
          `**Data:** ${new Date().toLocaleString('pt-BR')}\n` +
          (
            data.moderacao.linkRecurso
              ? `**Recurso:** ${data.moderacao.linkRecurso}`
              : ''
          )
        );

      // Se a DM falhar, o banimento ainda pode continuar.
      await target.send({
        embeds: [banEmbed]
      }).catch(() => {});

      await target.ban({
        reason: `${reason} | Moderador: ${message.author.tag}`
      });

      await message.reply(`Banido: ${target.user.tag}.`);

      await logAction(
        message.guild,
        `🔨 **Ban:** ${target.user.tag}\n` +
        `**Motivo:** ${reason}\n` +
        `**Moderador:** ${message.author.tag}`
      );
    } catch (error) {
      return message.reply(
        `Falha ao banir: ${error.message}`
      );
    }

    return;
  }

  // Expulsão.
  if (cmd === 'kick') {
    if (!target.kickable) {
      return message.reply(
        'Não consigo expulsar esse membro. Confira as permissões e a hierarquia.'
      );
    }

    await target.kick(reason);

    await message.reply(`Expulso: ${target.user.tag}.`);

    await logAction(
      message.guild,
      `👢 **Kick:** ${target.user.tag}\n**Motivo:** ${reason}`
    );

    return;
  }

  // Timeout.
  if (cmd === 'timeout') {
    const mins = Math.max(
      1,
      Math.min(40320, Number(args[1]) || 10)
    );

    if (!target.moderatable) {
      return message.reply(
        'Não consigo aplicar timeout nesse membro.'
      );
    }

    await target.timeout(mins * 60 * 1000, reason);

    await message.reply(
      `Timeout aplicado em ${target.user.tag} por ${mins} minuto(s).`
    );

    await logAction(
      message.guild,
      `⏱️ **Timeout:** ${target.user.tag} por ${mins} min\n` +
      `**Motivo:** ${reason}`
    );

    return;
  }

  // Advertências.
  if (cmd === 'warn') {
    const key = `${message.guild.id}:${target.id}`;
    const list = data.warnings[key] || [];

    list.push({
      reason,
      actor: message.author.id,
      at: Date.now()
    });

    data.warnings[key] = list;

    const level = Math.min(3, list.length);

    const rule = data.moderacao.advertencias[String(level)] || {
      acao: 'warn',
      duracaoMinutos: 0
    };

    try {
      if (
        rule.acao === 'timeout' &&
        target.moderatable
      ) {
        await target.timeout(
          Math.max(1, rule.duracaoMinutos || 10) * 60000,
          reason
        );
      } else if (
        rule.acao === 'kick' &&
        target.kickable
      ) {
        await target.kick(reason);
      } else if (
        rule.acao === 'ban' &&
        target.bannable &&
        (!isProtected(target) || canOverrideProtection(member))
      ) {
        await target.ban({ reason });
      }

      await target.send(
        `Você recebeu uma advertência em **${message.guild.name}**.\n` +
        `Motivo: ${reason}`
      ).catch(() => {});
    } catch (error) {
      console.error(
        'Ação da advertência falhou:',
        error.message
      );
    }

    saveData();

    await message.reply(
      `Advertência ${level}/3 registrada para ${target.user.tag}. ` +
      `Ação configurada: **${rule.acao}**.`
    );

    await logAction(
      message.guild,
      `⚠️ **Warn ${level}/3:** ${target.user.tag}\n` +
      `**Motivo:** ${reason}\n` +
      `**Moderador:** ${message.author.tag}`
    );
  }
});
client.on('interactionCreate', async interaction => {
  try {
    // Comando /config.
    if (
      interaction.isChatInputCommand() &&
      interaction.commandName === 'config'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(
          interaction,
          'Você não tem permissão para configurar o bot.'
        );
      }

      return interaction.reply({
        embeds: [configEmbed()],
        components: [configMenu()],
        flags: MessageFlags.Ephemeral
      });
    }

    // Menu principal de configuração.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'cfg:area'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const choice = interaction.values[0];

      if (choice === 'feed') {
        return interaction.reply({
          content: 'Escolha o canal do feed.',
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId('cfg:feedchannel')
                .setPlaceholder('Selecionar canal de texto')
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'logs') {
        return interaction.reply({
          content: 'Escolha o canal de logs.',
          components: [
            new ActionRowBuilder().addComponents(
              new ChannelSelectMenuBuilder()
                .setCustomId('cfg:logschannel')
                .setPlaceholder('Selecionar canal de logs')
                .setChannelTypes(ChannelType.GuildText)
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'antiban') {
        return interaction.reply({
          content: 'Escolha o tipo de cargo.',
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('cfg:antibanrole')
                .setPlaceholder('Configurar cargo')
                .addOptions(
                  {
                    label: 'Cargo protegido',
                    value: 'protected'
                  },
                  {
                    label: 'Cargo autorizado',
                    value: 'allowed'
                  }
                )
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'filtros') {
        return interaction.reply({
          content: 'Selecione um filtro para ligar ou desligar.',
          components: [toggleFilterMenu()],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'emojis') {
        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x6d28d9)
              .setTitle('Emojis do feed')
              .setDescription(
                `${emojisText()}\n\n` +
                'Edite os emojis usados no feed. ' +
                'Os emojis de moderação permanecem fixos.'
              )
          ],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('cfg:editemoji')
                .setLabel('Editar emojis')
                .setStyle(ButtonStyle.Primary)
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'warns') {
        return interaction.reply({
          content: 'Escolha o nível de advertência.',
          components: [
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId('cfg:warnlevel')
                .setPlaceholder('Nível')
                .addOptions(
                  { label: 'Nível 1', value: '1' },
                  { label: 'Nível 2', value: '2' },
                  { label: 'Nível 3', value: '3' }
                )
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }

      if (choice === 'banmsg') {
        return interaction.reply({
          content:
            `Link de recurso atual: ` +
            `${data.moderacao.linkRecurso || 'não configurado'}.`,
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('cfg:editappeal')
                .setLabel('Editar link de recurso')
                .setStyle(ButtonStyle.Primary)
            )
          ],
          flags: MessageFlags.Ephemeral
        });
      }
    }

    // Salvar canal selecionado.
    if (
      interaction.isChannelSelectMenu() &&
      [
        'cfg:feedchannel',
        'cfg:logschannel'
      ].includes(interaction.customId)
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const channelId = interaction.values[0];

      if (interaction.customId === 'cfg:feedchannel') {
        data.canalId = channelId;
      } else {
        data.moderacao.canalLogsId = channelId;
      }

      saveData();

      return replyEphemeral(
        interaction,
        `Canal salvo: <#${channelId}>.`
      );
    }

    // Escolher qual cargo configurar no anti-ban.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'cfg:antibanrole'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const mode = interaction.values[0];

      return interaction.reply({
        content:
          mode === 'protected'
            ? 'Selecione o cargo protegido pelo anti-ban.'
            : 'Selecione o cargo autorizado a banir membros protegidos.',
        components: [
          new ActionRowBuilder().addComponents(
            new RoleSelectMenuBuilder()
              .setCustomId(`cfg:role:${mode}`)
              .setPlaceholder('Selecionar cargo')
          )
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // Salvar cargo selecionado.
    if (
      interaction.isRoleSelectMenu() &&
      interaction.customId.startsWith('cfg:role:')
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const roleId = interaction.values[0];

      if (interaction.customId.endsWith('protected')) {
        data.moderacao.antiBan.cargoProtegidoId = roleId;
      } else {
        data.moderacao.antiBan.cargoAutorizadoId = roleId;
      }

      saveData();

      return replyEphemeral(
        interaction,
        `Cargo salvo: <@&${roleId}>.`
      );
    }

    // Ligar ou desligar filtros.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'cfg:togglefilter'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const key = interaction.values[0];

      data.moderacao.filtros[key] =
        !data.moderacao.filtros[key];

      saveData();

      return interaction.update({
        content:
          `Filtro **${key}** agora está **` +
          `${data.moderacao.filtros[key] ? 'ativado' : 'desativado'}**.`,
        components: [toggleFilterMenu()]
      });
    }

    // Configurar ação por nível de advertência.
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === 'cfg:warnlevel'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const level = interaction.values[0];
      const rule = data.moderacao.advertencias[level];

      const modal = new ModalBuilder()
        .setCustomId(`cfg:warnmodal:${level}`)
        .setTitle(`Advertência nível ${level}`);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('action')
            .setLabel('Ação: warn, timeout, kick ou ban')
            .setStyle(TextInputStyle.Short)
            .setValue(rule.acao)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('minutes')
            .setLabel('Duração do timeout em minutos')
            .setStyle(TextInputStyle.Short)
            .setValue(String(rule.duracaoMinutos || 10))
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    // Abrir formulário de edição dos emojis do feed.
    if (
      interaction.isButton() &&
      interaction.customId === 'cfg:editemoji'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const modal = new ModalBuilder()
        .setCustomId('cfg:emojimodal')
        .setTitle('Editar emojis do feed');

      for (const [key, value] of Object.entries(data.emojis).slice(0, 5)) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(key)
              .setLabel(key)
              .setStyle(TextInputStyle.Short)
              .setValue(value)
              .setRequired(true)
          )
        );
      }

      return interaction.showModal(modal);
    }

    // Editar link para contestar um banimento.
    if (
      interaction.isButton() &&
      interaction.customId === 'cfg:editappeal'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const modal = new ModalBuilder()
        .setCustomId('cfg:appealmodal')
        .setTitle('Link de recurso');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('url')
            .setLabel('URL de recurso/contestação')
            .setStyle(TextInputStyle.Short)
            .setValue(data.moderacao.linkRecurso || '')
            .setRequired(false)
        )
      );

      return interaction.showModal(modal);
    }

    // Salvar configuração das advertências.
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('cfg:warnmodal:')
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const level = interaction.customId.split(':').pop();
      const action = interaction.fields
        .getTextInputValue('action')
        .toLowerCase()
        .trim();

      const minutes =
        Number(interaction.fields.getTextInputValue('minutes')) || 10;

      if (!['warn', 'timeout', 'kick', 'ban'].includes(action)) {
        return replyEphemeral(
          interaction,
          'Ação inválida. Use warn, timeout, kick ou ban.'
        );
      }

      data.moderacao.advertencias[level].acao = action;
      data.moderacao.advertencias[level].duracaoMinutos =
        Math.max(0, Math.min(40320, minutes));

      saveData();

      return replyEphemeral(
        interaction,
        `Nível ${level} salvo: ação **${action}**, duração ${minutes} minuto(s).`
      );
    }

    // Salvar emojis do feed.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'cfg:emojimodal'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      for (const key of ['like', 'lixo', 'insta', 'corao', 'link']) {
        const value = interaction.fields
          .getTextInputValue(key)
          .trim();

        if (value) {
          data.emojis[key] = value.slice(0, 100);
        }
      }

      saveData();

      return replyEphemeral(
        interaction,
        'Emojis do feed atualizados. Os emojis de moderação continuam fixos.'
      );
    }

    // Salvar link de recurso.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'cfg:appealmodal'
    ) {
      if (!canConfigure(interaction)) {
        return replyEphemeral(interaction, 'Sem permissão.');
      }

      const url = interaction.fields
        .getTextInputValue('url')
        .trim();

      if (url && !/^https?:\/\/\S+$/i.test(url)) {
        return replyEphemeral(
          interaction,
          'Informe um link começando com http:// ou https://.'
        );
      }

      data.moderacao.linkRecurso = url || null;
      saveData();

      return replyEphemeral(interaction, 'Link de recurso atualizado.');
    }

    // Botões do painel privado de streaming.
    if (
      interaction.isButton() &&
      interaction.customId.startsWith('stream:')
    ) {
      if (!isOwner(interaction.user.id)) {
        return replyEphemeral(
          interaction,
          'Somente o dono principal pode controlar o streaming.'
        );
      }

      if (interaction.customId === 'stream:toggle') {
        data.streaming.ativo = !data.streaming.ativo;
        saveData();

        await updateStreamingPresence();

        return replyEphemeral(
          interaction,
          `Streaming ${data.streaming.ativo ? 'ativado' : 'desativado'}.`
        );
      }

      if (interaction.customId === 'stream:edit') {
        const modal = new ModalBuilder()
          .setCustomId('stream:modal')
          .setTitle('Editar presença de streaming');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('title')
              .setLabel('Título/status')
              .setStyle(TextInputStyle.Short)
              .setValue(data.streaming.titulo || 'Ao vivo')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('description')
              .setLabel('Descrição (opcional)')
              .setStyle(TextInputStyle.Short)
              .setValue(data.streaming.descricao || '')
              .setRequired(false)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('url')
              .setLabel('Link Twitch/YouTube válido')
              .setStyle(TextInputStyle.Short)
              .setValue(data.streaming.link || 'https://twitch.tv/')
              .setRequired(true)
          )
        );

        return interaction.showModal(modal);
      }
    }

    // Salvar dados de streaming.
    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'stream:modal'
    ) {
      if (!isOwner(interaction.user.id)) {
        return replyEphemeral(
          interaction,
          'Somente o dono principal pode controlar o streaming.'
        );
      }

      const title = interaction.fields
        .getTextInputValue('title')
        .trim();

      const description = interaction.fields
        .getTextInputValue('description')
        .trim();

      const url = interaction.fields
        .getTextInputValue('url')
        .trim();

      if (!/^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\//i.test(url)) {
        return replyEphemeral(
          interaction,
          'Use um link HTTPS válido do Twitch ou YouTube.'
        );
      }

      data.streaming.titulo = title.slice(0, 128);
      data.streaming.descricao = description.slice(0, 128);
      data.streaming.link = url;

      saveData();
      await updateStreamingPresence();

      return replyEphemeral(interaction, 'Dados de streaming salvos.');
    }
  } catch (error) {
    console.error('Erro na interação:', error);

    if (interaction.isRepliable()) {
      try {
        await replyEphemeral(
          interaction,
          'Ocorreu um erro. Confira os logs da hospedagem e as permissões do bot.'
        );
      } catch {}
    }
  }
});

// Registro de mensagens excluídas.
client.on('messageDelete', async message => {
  if (
    !data.moderacao.filtros.antiDelete ||
    !message.guild ||
    message.author?.bot
  ) return;

  const body =
    message.content?.slice(0, 1500) ||
    '[sem texto ou mensagem não estava em cache]';

  await logAction(
    message.guild,
    `🗑️ **Mensagem excluída** em <#${message.channel.id}>\n` +
    `**Autor:** ${message.author?.tag || 'desconhecido'}\n` +
    `**Conteúdo:** ${body}`
  );
});

// Detecção básica de possível raid.
client.on('guildMemberAdd', async member => {
  if (!data.moderacao.filtros.antiRaid) return;

  const joinedRecently = member.guild.members.cache.filter(
    m => Date.now() - m.joinedTimestamp < 15000
  ).size;

  if (joinedRecently >= 8) {
    await logAction(
      member.guild,
      `🚨 Possível raid: ${joinedRecently} membros entraram em aproximadamente 15 segundos.`
    );
  }
});

client.on('error', console.error);

process.on('unhandledRejection', error => {
  console.error('Promise rejeitada:', error);
});

// O token deve ser configurado como variável de ambiente na hospedagem.
if (!process.env.DISCORD_TOKEN) {
  console.error(
    'ERRO: configure a variável de ambiente DISCORD_TOKEN na hospedagem.'
  );

  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
