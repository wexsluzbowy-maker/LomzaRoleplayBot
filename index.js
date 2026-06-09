// ========================================================
// LOMZA RP - ULTIMATE BOT 2026 WITH TICKETS & BLACKLIST
// Wersja: MAX PREMIUM + ADVANCED TICKET SYSTEM + DM NOTIFY
// ========================================================

const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, MessageFlags, Events, Collection, ActivityType, Partials,
    ChannelType, StringSelectMenuBuilder, PermissionFlagsBits
} = require('discord.js');

const axios = require('axios');
const { QuickDB } = require('quick.db');
const express = require('express');
require('dotenv').config();

// ========================================================
// ⚠️ UZUPEŁNIJ SWOJE ID PONIŻEJ ⚠️
// ========================================================
const AWARYJNA_KONFIGURACJA = {
    GUILD_ID: "1198388580750471300",
    ROLE_ADMINISTRACJA: "1473749947231764561",
    ROLE_OBYWATEL: "1429893732936843400",
    ROLE_ZBANOWANY: "1384072549352214609", // <--- ID ROLI "ZBANOWANY"
    LOGS_BAN: "1307827966075605032",
    LOGS_VERIFY: "1432305354145923134",
    LOGS_CHECK: "1496584923576930465", 
    LOGS_APPEAL: "1432013814685106288",
    TICKET_CATEGORY_ID: "1459234132059226344"
};

const CONFIG = {
    TOKEN: process.env.TOKEN,
    GUILD_ID: process.env.GUILD_ID || AWARYJNA_KONFIGURACJA.GUILD_ID,
    ROLE_ADMINISTRACJA: process.env.ROLE_ADMINISTRACJA || AWARYJNA_KONFIGURACJA.ROLE_ADMINISTRACJA,
    ROLE_OBYWATEL: process.env.ROLE_OBYWATEL || AWARYJNA_KONFIGURACJA.ROLE_OBYWATEL,
    ROLE_ZBANOWANY: process.env.ROLE_ZBANOWANY || AWARYJNA_KONFIGURACJA.ROLE_ZBANOWANY,
    LOGS_BAN: process.env.LOGS_BAN || AWARYJNA_KONFIGURACJA.LOGS_BAN,
    LOGS_VERIFY: process.env.LOGS_VERIFY || AWARYJNA_KONFIGURACJA.LOGS_VERIFY,
    LOGS_CHECK: process.env.LOGS_CHECK || AWARYJNA_KONFIGURACJA.LOGS_CHECK,
    LOGS_APPEAL: process.env.LOGS_APPEAL || AWARYJNA_KONFIGURACJA.LOGS_APPEAL,
    TICKET_CATEGORY_ID: process.env.TICKET_CATEGORY_ID || AWARYJNA_KONFIGURACJA.TICKET_CATEGORY_ID,
    PORT: parseInt(process.env.PORT) || 8080
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

// ====================== POMOCNICZE FUNKCJE RANG ======================

/**
 * Zabiera wszystkie role i nadaje rolę Zbanowany
 */
async function stripRolesAndBan(member, reason = "Brak powodu") {
    if (!member) return;
    try {
        // Filtrujemy role, których bot nie może zdjąć (np. rola bota, @everyone)
        const rolesToRemove = member.roles.cache.filter(role => 
            role.id !== member.guild.id && 
            role.managed === false
        );
        
        await member.roles.remove(rolesToRemove, `Blokada: ${reason}`);
        await member.roles.add(CONFIG.ROLE_ZBANOWANY, `Blokada: ${reason}`);
    } catch (err) {
        console.error(`Błąd podczas zmieniania ról dla ${member.user.tag}:`, err);
    }
}

// ====================== STATUS GRACZY (API) ======================

function updateBotStatus() {
    if (!client.user) return;
    client.user.setPresence({
        activities: [{
            name: `Graczy na serwerze: ${currentPlayerCount}`,
            type: ActivityType.Watching
        }],
        status: 'online'
    });
}

app.post('/update-players', (req, res) => {
    const { playerCount } = req.body;
    if (typeof playerCount !== 'undefined') {
        currentPlayerCount = playerCount;
        updateBotStatus();
        res.status(200).send({ success: true });
    } else {
        res.status(400).send({ error: "Brak danych" });
    }
});

app.get('/check-access/:robloxId', async (req, res) => {
    const rid = req.params.robloxId;
    const banData = await db.get(`ban_${rid}`);
    
    if (!banData) return res.status(200).json({ allowed: true });

    if (banData.expires && banData.expires < Date.now()) {
        await db.delete(`ban_${rid}`);
        return res.status(200).json({ allowed: true });
    }

    return res.status(200).json({
        allowed: false,
        reason: banData.reason || "Brak powodu",
        expires: banData.expires || null
    });
});

// ====================== UTILS ======================

function formatPolishDate(date) {
    if (!date) return "Nieznana";
    return new Intl.DateTimeFormat('pl-PL', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date(date));
}

function getAccountAge(createdDate) {
    if (!createdDate) return { text: "Nieznany", suspect: false };
    const now = new Date();
    const created = new Date(createdDate);
    const diffDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
    if (diffDays < 14) return { text: `Nowe konto (${diffDays} dni! ⚠️)`, suspect: true };
    return { text: `${diffDays} dni temu`, suspect: false };
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
        { name: 'ustawkanal', description: 'Wysyła zaawansowany panel weryfikacji' },
        { name: 'ustawkanalticket', description: 'Wysyła profesjonalny panel ticketów' },
        { name: 'gpermban', description: 'Ban permanentny Roblox + Zabranie rang', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true },
            { name: 'powod', description: 'Powód bana', type: 3, required: true }
        ]},
        { name: 'gtempban', description: 'Ban czasowy Roblox', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true },
            { name: 'czas', description: 'Czas w minutach', type: 4, required: true },
            { name: 'powod', description: 'Powód bana', type: 3, required: true }
        ]},
        { name: 'gunban', description: 'Odbanuj ID Roblox i przywróć rangę (manualnie)', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true }
        ]},
        { name: 'odlaczkonto', description: 'Odłącza konto Roblox od Discorda', options: [
            { name: 'id', description: 'ID Roblox', type: 3, required: true }
        ]},
        { name: 'sprawdz', description: 'Maksymalnie sprawdza kartotekę i profil użytkownika', options: [
            { name: 'uzytkownik', description: 'Wybierz użytkownika Discord', type: 6, required: true }
        ]},
        { name: 'blacklista', description: 'Banuje wszystkich użytkowników z danego serwera Discord', options: [
            { name: 'serwer_id', description: 'ID serwera do zblacklistowania', type: 3, required: true },
            { name: 'powod', description: 'Powód blacklisty', type: 3, required: true }
        ]}
    ];

    try {
        await client.application.commands.set(commands);
        console.log(`✅ Zarejestrowano ${commands.length} komend`);
    } catch (err) {
        console.error("❌ Błąd podczas rejestracji komend:", err);
    }
});

// ====================== INTERAKCJE ======================

client.on(Events.InteractionCreate, async (i) => {
    try {
        if (i.isChatInputCommand()) {
            // Permission check
            if (['ustawkanal', 'ustawkanalticket', 'gpermban', 'gtempban', 'gunban', 'odlaczkonto', 'blacklista'].includes(i.commandName)) {
                if (!i.member.roles.cache.has(CONFIG.ROLE_ADMINISTRACJA)) {
                    return i.reply({ content: "❌ Brak uprawnień administracyjnych.", flags: MessageFlags.Ephemeral });
                }
            }

            if (i.commandName === 'ustawkanal') return setupVerification(i);
            if (i.commandName === 'ustawkanalticket') return setupTicketPanel(i);
            if (i.commandName === 'gpermban') return handleBan(i, true);
            if (i.commandName === 'gtempban') return handleBan(i, false);
            if (i.commandName === 'gunban') {
                const rid = i.options.getString('id');
                await db.delete(`ban_${rid}`);
                return i.reply({ content: `✅ Pomyślnie odbanowano konto Roblox o ID: **${rid}**. Pamiętaj o manualnym przywróceniu ról na Discordzie.`, flags: MessageFlags.Ephemeral });
            }
            if (i.commandName === 'odlaczkonto') return handleUnlink(i);
            if (i.commandName === 'sprawdz') return handleCheckPlayer(i);
            if (i.commandName === 'blacklista') return handleBlacklist(i);
        }

        if (i.isStringSelectMenu()) {
            if (i.customId === 'ticket_select') return handleTicketCreation(i);
        }

        if (i.isButton()) {
            if (i.customId === 'start_verify') return startVerifyModal(i);
            if (i.customId === 'check_profile') return checkRobloxProfile(i);
            if (i.customId.startsWith('acc_') || i.customId.startsWith('rej_')) return adminDecision(i);
            if (i.customId.startsWith('appeal_btn_')) return startAppealModal(i);
            if (i.customId.startsWith('app_acc_') || i.customId.startsWith('app_rej_')) return adminAppealDecision(i);
            
            if (i.customId === 'close_ticket') {
                await i.reply("🔒 Zamykanie ticketu...");
                // Logika zamykania (analogiczna do oryginału)
                setTimeout(() => i.channel.delete().catch(() => {}), 3000);
            }
        }

        if (i.isModalSubmit()) {
            if (i.customId === 'modal_verify') return handleVerifySubmit(i);
            if (i.customId.startsWith('modal_appeal_')) return handleAppealSubmit(i);
        }
    } catch (err) { 
        console.error("❌ Błąd interakcji:", err); 
    }
});

// ====================== BLACKLISTA SYSTEM ======================

async function handleBlacklist(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const targetGuildId = i.options.getString('serwer_id');
    const reason = i.options.getString('powod');

    try {
        const targetGuild = await client.guilds.fetch(targetGuildId).catch(() => null);
        if (!targetGuild) {
            return i.editReply("❌ Nie widzę tego serwera. Bot musi znajdować się na serwerze, który chcesz zblacklistować.");
        }

        const members = await targetGuild.members.fetch();
        let count = 0;

        for (const [id, member] of members) {
            // Sprawdzamy czy użytkownik jest na naszym serwerze (Lomza RP)
            const localMember = await i.guild.members.fetch(id).catch(() => null);
            if (localMember) {
                // Usuń rangi i daj Zbanowany
                await stripRolesAndBan(localMember, `Blacklista serwera: ${targetGuild.name} | Powód: ${reason}`);
                
                // Zbanuj powiązany profil Roblox (jeśli istnieje)
                const robloxId = await db.get(`user_${id}`);
                if (robloxId) {
                    await db.set(`ban_${robloxId}`, { 
                        reason: `Blacklista (${targetGuild.name}): ${reason}`, 
                        expires: null, 
                        moderator: i.user.id, 
                        timestamp: Date.now() 
                    });
                }
                count++;
            }
        }

        // Logi do kanału banów
        const banLog = await i.guild.channels.fetch(CONFIG.LOGS_BAN).catch(() => null);
        if (banLog) {
            const embed = new EmbedBuilder()
                .setTitle('🚨 Uruchomiono Masową Blacklistę')
                .setColor('#ff0000')
                .addFields(
                    { name: '🌐 Serwer źródłowy', value: `${targetGuild.name} (\`${targetGuildId}\`)` },
                    { name: '📄 Powód', value: reason },
                    { name: '👥 Liczba ukaranych osób', value: `${count}` },
                    { name: '🛠️ Administrator', value: `${i.user}` }
                )
                .setTimestamp();
            await banLog.send({ embeds: [embed] });
        }

        return i.editReply(`✅ Operacja zakończona. Przetworzono i zablokowano **${count}** użytkowników z serwera **${targetGuild.name}**.`);
    } catch (err) {
        console.error(err);
        return i.editReply("❌ Wystąpił błąd podczas procesowania blacklisty.");
    }
}

// ====================== TICKET & SPRAWDZ (ORIGINAL) ======================

async function setupTicketPanel(i) {
    const embed = new EmbedBuilder()
        .setTitle('📩 Centrum Pomocy — Łomża Roleplay')
        .setDescription('Wybierz odpowiednią kategorię z menu poniżej, aby otworzyć zgłoszenie.')
        .setColor('#2b2d31');
    const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select').setPlaceholder('Wybierz powód...')
        .addOptions([
            { label: 'Pomoc Ogólna', value: 'pomoc_ogolna', emoji: '❓' },
            { label: 'CK / FCK', value: 'ck_fck', emoji: '💀' },
            { label: 'Weryfikacja', value: 'weryfikacja', emoji: '🔑' },
            { label: 'Pojazdy', value: 'pojazdy', emoji: '🚗' },
            { label: 'Zgłoś Gracza', value: 'zglos_gracza', emoji: '🚫' }
        ]);
    const row = new ActionRowBuilder().addComponents(menu);
    await i.channel.send({ embeds: [embed], components: [row] });
    await i.reply({ content: "✅ Panel ticketów gotowy.", flags: MessageFlags.Ephemeral });
}

async function handleTicketCreation(i) {
    const option = i.values[0];
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const ticketChannel = await i.guild.channels.create({
        name: `🎫-${option}-${i.user.username}`,
        parent: CONFIG.TICKET_CATEGORY_ID,
        permissionOverwrites: [
            { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: CONFIG.ROLE_ADMINISTRACJA, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
    });
    const welcome = new EmbedBuilder().setTitle(`🎫 Ticket: ${option}`).setDescription(`Witaj ${i.user}, opisz swój problem.`);
    const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij').setStyle(ButtonStyle.Danger));
    await ticketChannel.send({ content: `${i.user} | <@&${CONFIG.ROLE_ADMINISTRACJA}>`, embeds: [welcome], components: [btn] });
    await i.editReply(`✅ Otwarto ticket: ${ticketChannel}`);
}

async function handleCheckPlayer(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const member = i.options.getMember('uzytkownik');
    if (!member) return i.editReply("❌ Nie znaleziono.");
    const robloxId = await db.get(`user_${member.id}`);
    const embed = new EmbedBuilder().setTitle(`🔍 Profil: ${member.user.username}`).setColor('#2b2d31');
    embed.addFields({ name: 'Discord', value: `<@${member.id}> (\`${member.id}\`)` });
    if (robloxId) {
        const roblox = await getRobloxInfo(robloxId);
        if (roblox.success) {
            embed.addFields({ name: 'Roblox', value: `Nazwa: \`${roblox.data.name}\`\nID: \`${robloxId}\`` });
            const ban = await db.get(`ban_${robloxId}`);
            if (ban) embed.addFields({ name: 'Status Ban', value: `Zablokowany: ${ban.reason}` }).setColor('#ff0000');
        }
    } else {
        embed.addFields({ name: 'Roblox', value: 'Brak powiązanego konta.' });
    }
    await i.editReply({ embeds: [embed] });
}

// ====================== SYSTEM BANÓW (UPDATED) ======================

async function handleBan(i, perm) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const rid = i.options.getString('id').trim();
    const reason = i.options.getString('powod');
    
    let expiry = null;
    let timeStr = "Na zawsze";

    if (!perm) {
        const mins = i.options.getInteger('czas');
        expiry = Date.now() + (mins * 60000);
        timeStr = `${mins}m`;
    }

    await db.set(`ban_${rid}`, { reason, expires: expiry, moderator: i.user.id, timestamp: Date.now() });
    const roblox = await getRobloxInfo(rid);

    // Szukaj członka na Discordzie, aby zabrać mu role
    const dId = await db.get(`robloxUser_${rid}`);
    if (dId) {
        const member = await i.guild.members.fetch(dId).catch(() => null);
        if (member) {
            if (perm) {
                // TYLKO PRZY PERMIE: Zabierz wszystko i daj rolę ZBANOWANY
                await stripRolesAndBan(member, reason);
            }
            
            const pvEmbed = new EmbedBuilder()
                .setTitle("🚫 Blokada w grze")
                .setColor('#ff0000')
                .setDescription(`Twój dostęp do **Lomza RP** został zablokowany.\n\n> Powód: \`${reason}\`\n> Czas: \`${timeStr}\``);
            
            if (perm) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`appeal_btn_${rid}`).setLabel('Apeluj').setStyle(ButtonStyle.Danger)
                );
                await member.send({ embeds: [pvEmbed], components: [row] }).catch(() => {});
            } else {
                await member.send({ embeds: [pvEmbed] }).catch(() => {});
            }
        }
    }

    const banLog = await i.guild.channels.fetch(CONFIG.LOGS_BAN).catch(() => null);
    if (banLog) {
        const embed = new EmbedBuilder()
            .setTitle(perm ? '🚫 Permanentny Ban' : '⏳ Czasowy Ban')
            .setColor(perm ? '#ff0000' : '#f1c40f')
            .setDescription(`Gracz: **${roblox.data?.name || rid}**\nPowód: ${reason}\nAdministrator: ${i.user}`);
        await banLog.send({ embeds: [embed] });
    }
    
    await i.editReply(`✅ Zarejestrowano blokadę (${timeStr}).`);
}

// ====================== WERYFIKACJA (ORIGINAL) ======================

async function setupVerification(i) {
    const embed = new EmbedBuilder().setTitle('🔑 Weryfikacja').setDescription('Kliknij przycisk poniżej.').setColor('#2b2d31');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_verify').setLabel('Rozpocznij').setStyle(ButtonStyle.Success));
    await i.channel.send({ embeds: [embed], components: [row] });
    await i.reply({ content: "✅ Panel wysłany.", flags: MessageFlags.Ephemeral });
}

async function startVerifyModal(i) {
    const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('Weryfikacja Roblox');
    const input = new TextInputBuilder().setCustomId('roblox_id').setLabel('ID Konta Roblox').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleVerifySubmit(i) {
    const rid = i.fields.getTextInputValue('roblox_id').trim();
    const word = "lomza" + Math.floor(Math.random() * 999);
    pendingVerifications.set(i.user.id, { rid, word });
    const embed = new EmbedBuilder().setTitle('Krok 2').setDescription(`Wpisz w opisie profilu Roblox słowo: **${word}**`).setColor('#f1c40f');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('check_profile').setLabel('Sprawdź').setStyle(ButtonStyle.Primary));
    await i.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function checkRobloxProfile(i) {
    const session = pendingVerifications.get(i.user.id);
    if (!session) return i.reply({ content: "❌ Błąd sesji.", flags: MessageFlags.Ephemeral });
    const roblox = await getRobloxInfo(session.rid);
    if (!roblox.success || !(roblox.data.description || "").includes(session.word)) {
        return i.reply({ content: "❌ Nie znaleziono słowa w opisie.", flags: MessageFlags.Ephemeral });
    }
    const chan = await i.guild.channels.fetch(CONFIG.LOGS_CHECK).catch(() => null);
    if (chan) {
        const embed = new EmbedBuilder().setTitle('Nowa weryfikacja').addFields({ name: 'Discord', value: `<@${i.user.id}>` }, { name: 'Roblox ID', value: session.rid });
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
    const member = await i.guild.members.fetch(dId).catch(() => null);
    if (action === 'acc') {
        await db.set(`user_${dId}`, rid);
        await db.set(`robloxUser_${rid}`, dId);
        if (member) await member.roles.add(CONFIG.ROLE_OBYWATEL).catch(() => {});
        await i.update({ content: `✅ Zaakceptowano <@${dId}>`, components: [] });
    } else {
        await i.update({ content: `❌ Odrzucono <@${dId}>`, components: [] });
    }
}

async function handleUnlink(i) {
    const rid = i.options.getString('id').trim();
    const dId = await db.get(`robloxUser_${rid}`);
    if (dId) {
        await db.delete(`robloxUser_${rid}`);
        await db.delete(`user_${dId}`);
        const member = await i.guild.members.fetch(dId).catch(() => null);
        if (member) await member.roles.remove(CONFIG.ROLE_OBYWATEL).catch(() => {});
        return i.reply({ content: "✅ Odłączono.", flags: MessageFlags.Ephemeral });
    }
    i.reply({ content: "❌ Nie znaleziono.", flags: MessageFlags.Ephemeral });
}

// ====================== APELACJE (ORIGINAL) ======================

async function startAppealModal(i) {
    const rid = i.customId.split('_')[2];
    const modal = new ModalBuilder().setCustomId(`modal_appeal_${rid}`).setTitle('Apelacja');
    const input = new TextInputBuilder().setCustomId('appeal_text').setLabel('Uzasadnienie').setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleAppealSubmit(i) {
    const rid = i.customId.split('_')[2];
    const text = i.fields.getTextInputValue('appeal_text');
    const chan = await client.channels.fetch(CONFIG.LOGS_APPEAL).catch(() => null);
    if (chan) {
        const embed = new EmbedBuilder().setTitle('Nowa Apelacja').addFields({ name: 'Gracz', value: `<@${i.user.id}> (\`${rid}\`)` }, { name: 'Treść', value: text });
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`app_acc_${rid}_${i.user.id}`).setLabel('Odbanuj').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`app_rej_${rid}_${i.user.id}`).setLabel('Odrzuć').setStyle(ButtonStyle.Danger)
        );
        await chan.send({ embeds: [embed], components: [row] });
    }
    await i.reply({ content: "✅ Apelacja wysłana.", flags: MessageFlags.Ephemeral });
}

async function adminAppealDecision(i) {
    const [,, rid, dId] = i.customId.split('_');
    if (i.customId.startsWith('app_acc')) {
        await db.delete(`ban_${rid}`);
        await i.update({ content: `✅ Odbanowano ${rid}`, components: [] });
    } else {
        await i.update({ content: `❌ Odrzucono apelację ${rid}`, components: [] });
    }
}

// ====================== URUCHOMIENIE ======================

client.login(CONFIG.TOKEN);
app.listen(CONFIG.PORT, () => console.log(`🚀 API i Bot działają.`));
