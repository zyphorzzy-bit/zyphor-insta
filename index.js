const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, SlashCommandBuilder 
} = require('discord.js');

let canalConfiguradoId = null;
const DONOS_PERMITIDOS = ['1541239768010981378', '1533306874513068093'];

// Armazena quem curtiu cada publicação para gerenciar os cliques
const curtidasPorPost = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('ready', async () => {
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
  console.log(`🤖 Bot online como ${client.user.tag}!`);
});

client.on('interactionCreate', async (interaction) => {
  
  // 1. Comando /config exclusivo para os IDs autorizados
  if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
    if (!DONOS_PERMITIDOS.includes(interaction.user.id)) {
      return interaction.reply({ content: '❌ Apenas os donos autorizados podem usar este comando.', ephemeral: true });
    }

    const canal = interaction.options.getChannel('canal');
    canalConfiguradoId = canal.id;
    return interaction.reply({ content: `✅ Canal ${canal} configurado com sucesso!`, ephemeral: true });
  }

  // 2. Sistema de Curtir/Descurtir
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

  // 3. Botão de Apagar
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

// Leitor de mensagens enviadas no canal configurado
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!canalConfiguradoId || message.channel.id !== canalConfiguradoId) return;

  const anexo = message.attachments.first();
  const eImagem = anexo && anexo.contentType?.startsWith('image/');

  if (eImagem) {
    const embed = new EmbedBuilder()
      .setTitle('IG')
      .setDescription(`@${message.author.username}`)
      .setImage(anexo.url)
      .setColor('#2b2d31');

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

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
  }
});

// Insira o seu Token diretamente entre as aspas simples abaixo
client.login('SEU_TOKEN_AQUI');
