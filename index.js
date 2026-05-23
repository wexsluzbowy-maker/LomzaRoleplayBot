// ========================================================
// LOMZA RP - ULTIMATE VERIFICATION BOT 2025
// Wersja: Finalna (Status Graczy + Apelacje + Logi + FIX)
// ========================================================

const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, MessageFlags, Events, Collection, ActivityType, Partials
} = require('discord.js');

const axios = require('axios');
const { QuickDB } = require('quick.db');
const express = require('express');
require('dotenv').config();

const CONFIG = {
    TOKEN: process.env.TOKEN,
    GUILD_ID: process.env.GUILD_ID,
    ROLE_ADMINISTRACJA: process.env.ROLE_ADMINISTRACJA,
    ROLE_OBYWATEL: process.env.ROLE_OBYWATEL,
    LOGS_BAN: process.env.LOGS_BAN,
    LOGS_VERIFY: process.env.LOGS_VERIFY,
    LOGS_CHECK: process.env.LOGS_CHECK,
    LOGS_APPEAL: process.env.LOGS_APPEAL,
    PORT: parseInt(process.env.PORT) || 3000
};

const db = new QuickDB({ filePath: "lomza_rp_ultimate.sqlite" });
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const app = express();
app.use(express.json());
const pendingVerifications = new Collection();
let currentPlayerCount = 0;

// ====================== STATUS GRACZY (API) ======================

function updateBotStatus() {
    if (!client.user) return;
    client.user.setPresence({
        activities: [{
            name: `W grze: ${currentPlayerCount}`,
            type: ActivityType.Watching
        }],
        status: 'online'
    });
}

// Endpoint do aktualizacji graczy z Roblox (POST na /update-players)
app.post('/update-players', (req, res) => {
    const { playerCount } = req.body;
    if (typeof playerCount !== 'undefined') {
        currentPlayerCount = playerCount;
        updateBotStatus();
        console.log(`📊 Zaktualizowano status graczy: ${playerCount}`);
        res.status(200).send({ success: true });
    } else {
        res.status(400).send({ error: "Brak danych" });
    }
});

// ====================== ENDPOINT SPRAWDZANIA DOSTĘPU ======================

app.get('/check-access/:robloxId', async (req, res) => {
    const rid = req.params.robloxId;
    const banData = await db.get(`ban_${rid}`);
    
    if (!banData) {
        return res.status(200).json({ allowed: true });
    }

    // Sprawdź czy ban jest czasowy i wygasł
    if (banData.expires && banData.expires < Date.now()) {
        await db.delete(`ban_${rid}`);
        console.log(`✅ Ban dla ${rid} wygasł automatycznie`);
        return res.status(200).json({ allowed: true });
    }

    // Gracz jest zbanowany
    console.log(`🚫 Zablokowano dostęp dla Roblox ID: ${rid}`);
    return res.status(200).json({
        allowed: false,
        reason: banData.reason || "Brak powodu",
        expires: banData.expires || null
    });
});

// ====================== UTILS ======================

function formatPolishDate(date) {
    return new Intl.DateTimeFormat('pl-PL', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(date);
}

function getAccountAge(createdDate) {
    if (!createdDate) return "Nieznany";
    const now = new Date();
    const created = new Date(createdDate);
    const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return "bardzo świeże";
    if (diffDays < 365) return "w tym roku";
    return `${Math.floor(diffDays / 365)} lat(a) temu`;
}

async function getRobloxInfo(robloxId) {
    try {
        const { data } = await axios.get(`https://users.roblox.com/v1/users/${robloxId}`, { timeout: 5000 });
        return { 
            success: true, 
            data, 
            avatar: `https://www.roblox.com/headshot-thumbnail/image?userId=${robloxId}&width=420&height=420&format=png` 
        };
    } catch { 
        return { success: false }; 
    }
}

// ====================== START ======================

client.once(Events.ClientReady, async () => {
    console.log(`✅ Zalogowano jako ${client.user.tag}`);
    updateBotStatus();

    const commands = [
        { name: 'ustawkanal', description: 'Wysyła panel weryfikacji' },
        { name: 'gpermban', description: 'Ban permanentny Roblox', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true },
            { name: 'powod', description: 'Powód bana', type: 3, required: true }
        ]},
        { name: 'gtempban', description: 'Ban czasowy Roblox', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true },
            { name: 'czas', description: 'Czas w minutach', type: 4, required: true },
            { name: 'powod', description: 'Powód bana', type: 3, required: true }
        ]},
        { name: 'gunban', description: 'Odbanuj ID Roblox', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true }
        ]},
        { name: 'odlaczkonto', description: 'Odłącza konto Roblox od Discorda', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true }
        ]},
        { name: 'sprawdz', description: 'Sprawdza gracza', options: [
            { name: 'uzytkownik', description: 'Użytkownik Discord', type: 6, required: true }
        ]}
    ];

    await client.application.commands.set(commands);
    console.log(`✅ Zarejestrowano ${commands.length} komend slash`);
});

// ====================== INTERAKCJE ======================

client.on(Events.InteractionCreate, async (i) => {
    try {
        if (i.isChatInputCommand()) {
            if (!i.member.roles.cache.has(CONFIG.ROLE_ADMINISTRACJA)) {
                return i.reply({ content: "❌ Brak uprawnień.", flags: MessageFlags.Ephemeral });
            }

            if (i.commandName === 'ustawkanal') return setupVerification(i);
            if (i.commandName === 'gpermban') return handleBan(i, true);
            if (i.commandName === 'gtempban') return handleBan(i, false);
            if (i.commandName === 'gunban') {
                const rid = i.options.getString('id');
                await db.delete(`ban_${rid}`);
                console.log(`✅ Odbanowano Roblox ID: ${rid} przez ${i.user.tag}`);
                return i.reply({ content: `✅ Odbanowano ID ${rid}.`, flags: MessageFlags.Ephemeral });
            }
            if (i.commandName === 'odlaczkonto') return handleUnlink(i);
            if (i.commandName === 'sprawdz') return handleCheckPlayer(i);
        }

        if (i.isButton()) {
            if (i.customId === 'start_verify') return startVerifyModal(i);
            if (i.customId === 'check_profile') return checkRobloxProfile(i);
            if (i.customId.startsWith('acc_') || i.customId.startsWith('rej_')) return adminDecision(i);
            if (i.customId.startsWith('appeal_btn_')) return startAppealModal(i);
            if (i.customId.startsWith('app_acc_') || i.customId.startsWith('app_rej_')) return adminAppealDecision(i);
        }

        if (i.isModalSubmit()) {
            if (i.customId === 'modal_verify') return handleVerifySubmit(i);
            if (i.customId.startsWith('modal_appeal_')) return handleAppealSubmit(i);
        }
    } catch (err) { 
        console.error("❌ Błąd interakcji:", err); 
    }
});

// ====================== KOMENDY ======================

async function handleUnlink(i) {
    const rid = i.options.getString('id').trim();
    const dId = await db.get(`robloxUser_${rid}`);
    if (dId) {
        await db.delete(`robloxUser_${rid}`);
        await db.delete(`user_${dId}`);
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        const member = await guild.members.fetch(dId).catch(() => null);
        if (member) await member.roles.remove(CONFIG.ROLE_OBYWATEL).catch(() => {});
        console.log(`🔓 Odłączono konto Roblox ${rid} od Discord ${dId}`);
        return i.reply({ content: `✅ Rozłączono konto ${rid}.`, flags: MessageFlags.Ephemeral });
    }
    i.reply({ content: "❌ Nie ma tego konta w bazie.", flags: MessageFlags.Ephemeral });
}

async function handleCheckPlayer(i) {
    const member = i.options.getMember('uzytkownik');
    const robloxId = await db.get(`user_${member.id}`);
    const banData = robloxId ? await db.get(`ban_${robloxId}`) : null;
    const embed = new EmbedBuilder()
        .setTitle(`Profil: ${member.user.tag}`)
        .setColor('#3498db')
        .addFields(
            { name: 'Roblox ID', value: robloxId || 'Brak', inline: true },
            { name: 'Ban', value: banData ? `TAK: ${banData.reason}` : 'Nie', inline: true }
        );
    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ====================== WERYFIKACJA ======================

async function setupVerification(i) {
    const embed = new EmbedBuilder()
        .setTitle('🔑 System Weryfikacji Lomza RP')
        .setDescription('Kliknij przycisk poniżej, aby połączyć konto Roblox.')
        .setColor('#2b2d31');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_verify')
            .setLabel('Zweryfikuj konto')
            .setStyle(ButtonStyle.Secondary)
    );
    await i.channel.send({ embeds: [embed], components: [row] });
    await i.reply({ content: "✅ Wysłano panel weryfikacji.", flags: MessageFlags.Ephemeral });
}

async function startVerifyModal(i) {
    const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('Weryfikacja');
    const input = new TextInputBuilder()
        .setCustomId('roblox_id')
        .setLabel('Podaj ID Roblox')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleVerifySubmit(i) {
    const rid = i.fields.getTextInputValue('roblox_id').trim().replace(/\D/g, '');
    const word = ["lomza", "kawa", "niebo", "rower", "zegar"][Math.floor(Math.random()*5)];
    pendingVerifications.set(i.user.id, { rid, word });
    const embed = new EmbedBuilder()
        .setDescription(`Ustaw w opisie: **${word}**\n[Profil](https://www.roblox.com/users/${rid}/profile)`)
        .setColor('#f1c40f');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('check_profile')
            .setLabel('Sprawdź profil')
            .setStyle(ButtonStyle.Primary)
    );
    await i.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function checkRobloxProfile(i) {
    const session = pendingVerifications.get(i.user.id);
    if (!session) return i.reply({ content: "❌ Błąd sesji.", flags: MessageFlags.Ephemeral });
    const roblox = await getRobloxInfo(session.rid);
    if (!roblox.success) return i.reply({ content: "❌ Błąd Roblox API.", flags: MessageFlags.Ephemeral });
    if (!(roblox.data.description || "").toLowerCase().includes(session.word)) {
        return i.reply({ content: "❌ Brak słowa w opisie.", flags: MessageFlags.Ephemeral });
    }

    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    const chan = guild.channels.cache.get(CONFIG.LOGS_CHECK);
    if (chan) {
        const embed = new EmbedBuilder()
            .setTitle('Nowa Weryfikacja')
            .setColor('#3498db')
            .addFields(
                { name: 'Discord', value: `<@${i.user.id}>` }, 
                { name: 'Roblox', value: `${roblox.data.displayName} (${session.rid})` }
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`acc_${i.user.id}_${session.rid}`).setLabel('Akceptuj').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rej_${i.user.id}_${session.rid}`).setLabel('Odrzuć').setStyle(ButtonStyle.Danger)
        );
        await chan.send({ embeds: [embed], components: [row] });
    }
    await i.reply({ content: "✅ Wysłano do administracji.", flags: MessageFlags.Ephemeral });
}

async function adminDecision(i) {
    const [action, dId, rid] = i.customId.split('_');
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    const member = await guild.members.fetch(dId).catch(() => null);
    const roblox = await getRobloxInfo(rid);
    const logChan = guild.channels.cache.get(CONFIG.LOGS_VERIFY);

    if (action === 'acc') {
        await db.set(`user_${dId}`, rid);
        await db.set(`robloxUser_${rid}`, dId);
        if (member) await member.roles.add(CONFIG.ROLE_OBYWATEL).catch(() => {});

        if (logChan) {
            const logEmbed = new EmbedBuilder()
                .setAuthor({ name: 'Użytkownik zweryfikowany' })
                .setColor('#43b581')
                .setDescription(`**Discord**\n<@${dId}>\n\n**Roblox**\n${roblox.data?.displayName} (\`${rid}\`)\n\n**Wiek konta**\n${getAccountAge(roblox.data?.created)}\n\n**Administrator**\n<@${i.user.id}>`)
                .setTimestamp();
            await logChan.send({ embeds: [logEmbed] });
        }
        if (member) member.send("✅ Twoja weryfikacja na **Lomza RP** została zaakceptowana!").catch(() => {});
        await i.update({ content: `✅ Zaakceptowano <@${dId}>`, components: [] });
        console.log(`✅ Zweryfikowano: Discord ${dId} ↔ Roblox ${rid}`);
    } else {
        if (member) member.send("❌ Twoja weryfikacja została odrzucona.").catch(() => {});
        await i.update({ content: `❌ Odrzucono <@${dId}>`, components: [] });
        console.log(`❌ Odrzucono weryfikację: Discord ${dId}`);
    }
}

// ====================== BANY ======================

async function handleBan(i, perm) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const rid = i.options.getString('id').trim();
    const reason = i.options.getString('powod');
    const mins = perm ? null : i.options.getInteger('czas');
    const expiry = mins ? Date.now() + (mins * 60000) : null;
    const roblox = await getRobloxInfo(rid);
    const dId = await db.get(`robloxUser_${rid}`);

    await db.set(`ban_${rid}`, { reason, expires: expiry, moderator: i.user.id });

    const banLog = i.guild.channels.cache.get(CONFIG.LOGS_BAN);
    if (banLog) {
        const timeStr = perm ? "Zawsze" : `${mins}m`;
        const embed = new EmbedBuilder()
            .setTitle('🔐 Zbanowano Gracza')
            .setThumbnail(roblox.avatar)
            .setColor('#2f3136')
            .setDescription(`Zbanowany gracz nie może grać do czasu upłynięcia blokady.\nGracz **${roblox.data?.displayName || 'Nieznany'} (${rid})** został zablokowany na **${timeStr}**.\n\n**Powód** ${reason}\n\nZbanowano przez ${i.user.username}`);
        
        // FIX: Ping zbanowanego gracza zamiast moderatora
        const pingContent = dId ? `<@${dId}>` : `Roblox ID: ${rid}`;
        await banLog.send({ content: pingContent, embeds: [embed] });
    }

    if (dId) {
        const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
        const member = await guild.members.fetch(dId).catch(() => null);
        if (member) {
            const pvEmbed = new EmbedBuilder()
                .setTitle("🚫 Zostałeś zablokowany")
                .setColor('#ff0000')
                .setDescription(`**Powód:** ${reason}\n**Czas:** ${perm ? 'Permanentnie' : mins + ' min'}\n\nMożesz odwołać się za pomocą przycisku poniżej.`);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`appeal_btn_${rid}`)
                    .setLabel('Apeluj od bana')
                    .setStyle(ButtonStyle.Danger)
            );
            await member.send({ embeds: [pvEmbed], components: [row] }).catch(err => {
                console.log(`⚠️ Nie można wysłać PV do ${member.user.tag}:`, err.message);
            });
        }
    }
    
    console.log(`🚫 Zbanowano Roblox ID ${rid} przez ${i.user.tag} | Powód: ${reason}`);
    await i.editReply(`✅ Zbanowano ${rid}.`);
}

// ====================== APELACJE ======================

async function startAppealModal(i) {
    const rid = i.customId.split('_')[2];
    const modal = new ModalBuilder()
        .setCustomId(`modal_appeal_${rid}`)
        .setTitle('Apelacja od bana');
    const input = new TextInputBuilder()
        .setCustomId('appeal_text')
        .setLabel('Twoje uzasadnienie')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleAppealSubmit(i) {
    const rid = i.customId.split('_')[2];
    const text = i.fields.getTextInputValue('appeal_text');
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    const chan = guild.channels.cache.get(CONFIG.LOGS_APPEAL);
    if (chan) {
        const embed = new EmbedBuilder()
            .setTitle('⚖️ Nowa apelacja')
            .setColor('#f1c40f')
            .addFields(
                { name: 'Użytkownik', value: `<@${i.user.id}>` }, 
                { name: 'ID Roblox', value: rid }, 
                { name: 'Treść', value: text }
            );
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_acc_${rid}_${i.user.id}`).setLabel('Zaakceptuj').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app_rej_${rid}_${i.user.id}`).setLabel('Odrzuć').setStyle(ButtonStyle.Danger)
        );
        await chan.send({ embeds: [embed], components: [row] });
    }
    console.log(`⚖️ Nowa apelacja od ${i.user.tag} (Roblox ID: ${rid})`);
    await i.reply({ content: "✅ Apelacja wysłana.", flags: MessageFlags.Ephemeral });
}

async function adminAppealDecision(i) {
    const [,, rid, dId] = i.customId.split('_');
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID);
    const member = await guild.members.fetch(dId).catch(() => null);

    if (i.customId.startsWith('app_acc')) {
        await db.delete(`ban_${rid}`);
        if (member) {
            await member.send("✅ Twoja apelacja została **zaakceptowana**. Zostałeś odbanowany!").catch(() => {});
        }
        await i.update({ content: `✅ Zaakceptowano apelację ID ${rid}.`, components: [] });
        console.log(`✅ Zaakceptowano apelację: Roblox ID ${rid}`);
    } else {
        if (member) {
            await member.send("❌ Twoja apelacja została **odrzucona** przez administrację.").catch(() => {});
        }
        await i.update({ content: `❌ Odrzucono apelację ID ${rid}.`, components: [] });
        console.log(`❌ Odrzucono apelację: Roblox ID ${rid}`);
    }
}

// ====================== URUCHOMIENIE ======================

client.login(CONFIG.TOKEN);
app.listen(CONFIG.PORT, () => console.log(`🚀 API działa na porcie ${CONFIG.PORT}`));
