const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, SlashCommandBuilder, ActivityType,
  AttachmentBuilder
} = require('discord.js');

let canalConfiguradoId = null;
const DONOS_PERMITIDOS = ['1541239768010981378', '1533306874513068093'];

const curtidasPorPost = new Map();
const cooldowns = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', async () => {
  client.user.setPresence({
    activities: [{
      name: "zyphor app's",
      type: ActivityType.Streaming,
      url: "https://www.twitch.tv/discord"
    }],
    status: 'online',
  });

  const commands = [
    new SlashCommandBuilder()
      .setName('config')
      .setDescription('Define o canal oficial para o feed de fotos.')
      .addChannelOption(option => 
        option.setName('canal')
          .setDescription('Selecione o canal das fotos')
          .setRequired(true))
  ];

  await client.application.commands.set(commands);
  console.log(`🤖 Bot online com sucesso como ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
    if (!DONOS_PERMITIDOS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Apenas os donos autorizados podem usar este comando.', ephemeral: true });
    }

    const canal = interaction.options.getChannel('canal');
    canalConfiguradoId = canal.id;
    return interaction.reply({ content: `✅ Canal ${canal} configurado com sucesso!`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'like_button') {
    const msgId = interaction.message.id;
    
    if (!curtidasPorPost.has(msgId)) {
      curtidasPorPost.set(msgId, new Set());
    }

    const listaCurtidas = curtidasPorPost.get(msgId);
    const userId = interaction.user.id;

    if (listaCurtidas.has(userId)) {
      listaCurtidas.delete(userId);
    } else {
      listaCurtidas.add(userId);
    }

    const totalCurtidas = listaCurtidas.size;

    const rowAtualizada = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('like_button')
        .setLabel(totalCurtidas.toString())
        .setEmoji('1542398878161043546')
        .setStyle(ButtonStyle.Secondary),

      ButtonBuilder.from(interaction.message.components[0].components[1])
    );

    await interaction.update({ components: [rowAtualizada] });
  }

  if (interaction.isButton() && interaction.customId.startsWith('delete_')) {
    const autorId = interaction.customId.split('_')[1];
    const eDono = DONOS_PERMITIDOS.includes(interaction.user.id);

    if (interaction.user.id === autorId || eDono) {
      curtidasPorPost.delete(interaction.message.id);
      await interaction.message.delete();
    } else {
      await interaction.reply({ content: '❌ Apenas o autor da foto ou os donos podem apagar!', ephemeral: true });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!canalConfiguradoId || message.channel.id !== canalConfiguradoId) return;

  const anexo = message.attachments.first();
  const eImagem = anexo && anexo.contentType?.startsWith('image/');

  if (eImagem) {
    const userId = message.author.id;
    const agora = Date.now();
    const tempoCooldown = 5 * 60 * 1000;

    if (!DONOS_PERMITIDOS.includes(userId) && cooldowns.has(userId)) {
      const proximoEnvio = cooldowns.get(userId) + tempoCooldown;

      if (agora < proximoEnvio) {
        const tempoRestante = Math.ceil((proximoEnvio - agora) / 1000 / 60);
        await message.delete();
        
        const aviso = await message.channel.send(`⏳ <@${userId}>, aguarde **${tempoRestante} min** para postar outra foto!`);
        setTimeout(() => aviso.delete().catch(() => {}), 5000);
        return;
      }
    }

    cooldowns.set(userId, agora);

    // Reenvia o anexo diretamente para não quebrar o link da imagem
    const arquivoImagem = new AttachmentBuilder(anexo.url, { name: 'imagem.png' });

    const embed = new EmbedBuilder()
      .setTitle('IG')
      .setDescription(`@${message.author.username}`)
      .setImage('attachment://imagem.png') // Conecta ao anexo reenviado
      .setColor('#2b2d31'); // Cor escura para combinar com a interface do Discord

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('like_button')
        .setLabel('0')
        .setEmoji('1542398878161043546')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`delete_${message.author.id}`)
        .setEmoji('1542398876873400350')
        .setStyle(ButtonStyle.Secondary)
    );

    await message.channel.send({ embeds: [embed], files: [arquivoImagem], components: [row] });
    await message.delete();
  }
});

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);
