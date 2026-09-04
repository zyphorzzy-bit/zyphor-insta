const { 
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
  ButtonBuilder, ButtonStyle, SlashCommandBuilder, ActivityType,
  AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

let canalConfiguradoId = null;
const DONOS_PERMITIDOS = ['1541239768010981378', '1533306874513068093'];

// Armazenamento
const curtidasPorPost = new Map(); // Map<messageId, Set<userId>>
const comentariosPorPost = new Map(); // Map<messageId, Array<{ user: string, texto: string }>>
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
      .setDescription('Define o canal oficial para o feed de mídias.')
      .addChannelOption(option => 
        option.setName('canal')
          .setDescription('Selecione o canal das mídias')
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

  // 1. Sistema de Curtir / Descurtir
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

    const componentes = interaction.message.components[0].components;
    const rowAtualizada = new ActionRowBuilder().setComponents([
      new ButtonBuilder()
        .setCustomId('like_button')
        .setLabel(totalCurtidas.toString())
        .setEmoji('1542398878161043546')
        .setStyle(ButtonStyle.Secondary),
      ButtonBuilder.from(componentes[1]),
      ButtonBuilder.from(componentes[2]),
      ButtonBuilder.from(componentes[3])
    ]);

    await interaction.update({ components: [rowAtualizada] });
  }

  // 2. ABRIR MODAL DE COMENTÁRIO
  if (interaction.isButton() && interaction.customId.startsWith('comment_btn_')) {
    const msgId = interaction.message.id;

    const modal = new ModalBuilder()
      .setCustomId(`modal_comment_${msgId}`)
      .setTitle('💬 Adicionar Comentário');

    const campoTexto = new TextInputBuilder()
      .setCustomId('texto_comentario')
      .setLabel('Escreva seu comentário na foto:')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(300)
      .setRequired(true);

    const primeiraLinha = new ActionRowBuilder().addComponents(campoTexto);
    modal.addComponents(primeiraLinha);

    await interaction.showModal(modal);
  }

  // 3. RECEBER O COMENTÁRIO ENVIADO NO MODAL
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_comment_')) {
    const msgId = interaction.customId.replace('modal_comment_', '');
    const texto = interaction.fields.getTextInputValue('texto_comentario');

    if (!comentariosPorPost.has(msgId)) {
      comentariosPorPost.set(msgId, []);
    }

    comentariosPorPost.get(msgId).push({
      user: interaction.user.id,
      texto: texto
    });

    return interaction.reply({ content: '✅ Seu comentário foi enviado com sucesso!', ephemeral: true });
  }

  // 4. VER LISTA PERSONALIZADA (Curtidas e Comentários)
  if (interaction.isButton() && interaction.customId === 'view_list') {
    const msgId = interaction.message.id;
    const curtidas = curtidasPorPost.get(msgId);
    const comentarios = comentariosPorPost.get(msgId);

    const listaCurtidasFormatada = (curtidas && curtidas.size > 0)
      ? Array.from(curtidas).map(id => `<:corao:1542398878161043546> <@${id}>`).join('\n')
      : 'Ninguém curtiu ainda.';

    const listaComentariosFormatada = (comentarios && comentarios.length > 0)
      ? comentarios.map(c => `<:cometrio:1542398949925847082> <@${c.user}>: *"${c.texto}"*`).join('\n')
      : 'Nenhum comentário publicado.';

    const embedLista = new EmbedBuilder()
      .setTitle('✨ Interações da Publicação')
      .setColor('#2b2d31')
      .addFields(
        { name: `❤️ Curtidas (${curtidas ? curtidas.size : 0})`, value: listaCurtidasFormatada },
        { name: `💬 Comentários (${comentarios ? comentarios.length : 0})`, value: listaComentariosFormatada }
      );

    return interaction.reply({ embeds: [embedLista], ephemeral: true });
  }

  // 5. BOTÃO DE APAGAR
  if (interaction.isButton() && interaction.customId.startsWith('delete_')) {
    const autorId = interaction.customId.split('_')[1];
    const eDono = DONOS_PERMITIDOS.includes(interaction.user.id);

    if (interaction.user.id === autorId || eDono) {
      curtidasPorPost.delete(interaction.message.id);
      comentariosPorPost.delete(interaction.message.id);
      await interaction.message.delete();
    } else {
      await interaction.reply({ content: '❌ Apenas o autor ou os donos podem apagar!', ephemeral: true });
    }
  }
});

// Leitor de envio no canal
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!canalConfiguradoId || message.channel.id !== canalConfiguradoId) return;

  const anexo = message.attachments.first();
  if (!anexo) return;

  const eImagem = anexo.contentType?.startsWith('image/');
  const eVideo = anexo.contentType?.startsWith('video/');

  if (eImagem || eVideo) {
    const userId = message.author.id;
    const agora = Date.now();
    const tempoCooldown = 5 * 60 * 1000;

    if (!DONOS_PERMITIDOS.includes(userId) && cooldowns.has(userId)) {
      const proximoEnvio = cooldowns.get(userId) + tempoCooldown;

      if (agora < proximoEnvio) {
        const tempoRestante = Math.ceil((proximoEnvio - agora) / 1000 / 60);
        await message.delete();
        
        const aviso = await message.channel.send(`⏳ <@${userId}>, aguarde **${tempoRestante} min** para postar novamente!`);
        setTimeout(() => aviso.delete().catch(() => {}), 5000);
        return;
      }
    }

    cooldowns.set(userId, agora);

    const rowV2 = new ActionRowBuilder().setComponents([
      new ButtonBuilder()
        .setCustomId('like_button')
        .setLabel('0')
        .setEmoji('1542398878161043546')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`comment_btn_${message.author.id}`)
        .setEmoji('1542398949925847082')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('view_list')
        .setEmoji('1545268228404805672')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`delete_${message.author.id}`)
        .setEmoji('1542398876873400350')
        .setStyle(ButtonStyle.Secondary)
    ]);

    if (eImagem) {
      const arquivoImagem = new AttachmentBuilder(anexo.url, { name: 'midia.png' });
      const embed = new EmbedBuilder()
        .setTitle('IG')
        .setDescription(`<@${message.author.id}>`)
        .setImage('attachment://midia.png')
        .setColor('#2b2d31');

      await message.channel.send({ embeds: [embed], files: [arquivoImagem], components: [rowV2] });
    } else if (eVideo) {
      const arquivoVideo = new AttachmentBuilder(anexo.url, { name: 'midia.mp4' });

      await message.channel.send({ 
        content: `**IG**\n<@${message.author.id}>`, 
        files: [arquivoVideo], 
        components: [rowV2] 
      });
    }

    await message.delete();
  }
});

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);
