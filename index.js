// ========================================================
// LOMZA RP - ULTIMATE VERIFICATION BOT 2026
// Wersja: MAX PREMIUM (Zoptymalizowany pod wzór logów banów)
// ========================================================

const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, MessageFlags, Events, Collection, ActivityType, Partials,
    ChannelType
} = require('discord.js');

const axios = require('axios');
const { QuickDB } = require('quick.db');
const express = require('express');
require('dotenv').config();

// ========================================================
// ⚠️ UZUPEŁNIJ SWOJE ID PONIŻEJ (ZABEZPIECZENIE PRZED ERR .ENV) ⚠️
// ========================================================
const AWARYJNA_KONFIGURACJA = {
    GUILD_ID: "1198388580750471300",
    ROLE_ADMINISTRACJA: "1473749947231764561",
    ROLE_OBYWATEL: "1429893732936843400",
    LOGS_BAN: "1307827966075605032",
    LOGS_VERIFY: "1432305354145923134",
    LOGS_CHECK: "1496584923576930465", // To o ten kanał prosi bot
    LOGS_APPEAL: "1432013814685106288"
};

const CONFIG = {
    TOKEN: process.env.TOKEN,
    GUILD_ID: process.env.GUILD_ID || AWARYJNA_KONFIGURACJA.GUILD_ID,
    ROLE_ADMINISTRACJA: process.env.ROLE_ADMINISTRACJA || AWARYJNA_KONFIGURACJA.ROLE_ADMINISTRACJA,
    ROLE_OBYWATEL: process.env.ROLE_OBYWATEL || AWARYJNA_KONFIGURACJA.ROLE_OBYWATEL,
    LOGS_BAN: process.env.LOGS_BAN || AWARYJNA_KONFIGURACJA.LOGS_BAN,
    LOGS_VERIFY: process.env.LOGS_VERIFY || AWARYJNA_KONFIGURACJA.LOGS_VERIFY,
    LOGS_CHECK: process.env.LOGS_CHECK || AWARYJNA_KONFIGURACJA.LOGS_CHECK,
    LOGS_APPEAL: process.env.LOGS_APPEAL || AWARYJNA_KONFIGURACJA.LOGS_APPEAL,
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
        console.log(`📊 Zaktualizowano status graczy: ${playerCount}`);
        res.status(200).send({ success: true });
    } else {
        res.status(400).send({ error: "Brak danych" });
    }
});

app.get('/check-access/:robloxId', async (req, res) => {
    const rid = req.params.robloxId;
    const banData = await db.get(`ban_${rid}`);
    
    if (!banData) {
        return res.status(200).json({ allowed: true });
    }

    if (banData.expires && banData.expires < Date.now()) {
        await db.delete(`ban_${rid}`);
        console.log(`✅ Ban dla ${rid} wygasł automatycznie`);
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
    if (diffDays < 30) return { text: `Świeże konto (${diffDays} dni)`, suspect: true };
    if (diffDays < 365) return { text: `${diffDays} dni temu`, suspect: false };
    
    const years = Math.floor(diffDays / 365);
    return { text: `${years} lat(a) temu (${diffDays} dni)`, suspect: false };
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
        { name: 'sprawdz', description: 'Maksymalnie sprawdza kartotekę i profil użytkownika', options: [
            { name: 'uzytkownik', description: 'Wybierz użytkownika Discord', type: 6, required: true }
        ]}
    ];

    try {
        await client.application.commands.set(commands);
        console.log(`✅ Zarejestrowano ${commands.length} zaawansowanych komend slash`);
    } catch (err) {
        console.error("❌ Błąd podczas rejestracji komend:", err);
    }
});

// ====================== INTERAKCJE ======================

client.on(Events.InteractionCreate, async (i) => {
    try {
        if (i.isChatInputCommand()) {
            if (i.commandName === 'ustawkanal') {
                if (!i.member.roles.cache.has(CONFIG.ROLE_ADMINISTRACJA)) {
                    return i.reply({ content: "❌ Brak uprawnień administratorskich.", flags: MessageFlags.Ephemeral });
                }
                return setupVerification(i);
            }
            if (['gpermban', 'gtempban', 'gunban', 'odlaczkonto'].includes(i.commandName)) {
                if (!i.member.roles.cache.has(CONFIG.ROLE_ADMINISTRACJA)) {
                    return i.reply({ content: "❌ Brak uprawnień do zarządzania blokadami.", flags: MessageFlags.Ephemeral });
                }
            }
            if (i.commandName === 'gpermban') return handleBan(i, true);
            if (i.commandName === 'gtempban') return handleBan(i, false);
            if (i.commandName === 'gunban') {
                const rid = i.options.getString('id');
                await db.delete(`ban_${rid}`);
                return i.reply({ content: `✅ Pomyślnie odbanowano konto Roblox o ID: **${rid}**.`, flags: MessageFlags.Ephemeral });
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

// ====================== MAKSYMALNE /SPRAWDZ ======================

async function handleCheckPlayer(i) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const member = i.options.getMember('uzytkownik');
    
    if (!member) {
        return i.editReply("❌ Nie odnaleziono podanego użytkownika na tym serwerze.");
    }

    const robloxId = await db.get(`user_${member.id}`);
    const embed = new EmbedBuilder()
        .setTitle(`🔍 Szczegółowy Profil: ${member.user.username}`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
        .setColor('#2b2d31')
        .setTimestamp();

    // 1. Sekcja Discord
    embed.addFields(
        { name: '👤 Dane Discord', value: `> **Wzmianka:** ${member}\n> **ID Konta:** \`${member.id}\`\n> **Utworzono:** ${formatPolishDate(member.user.createdAt)}\n> **Dołączył:** ${formatPolishDate(member.joinedAt)}`, inline: false }
    );

    // 2. Sekcja Roblox
    if (robloxId) {
        const roblox = await getRobloxInfo(robloxId);
        if (roblox.success) {
            const ageInfo = getAccountAge(roblox.data.created);
            embed.setThumbnail(roblox.avatar);
            embed.addFields(
                { name: '🎮 Połączone Konto Roblox', value: `> **Nazwa użytkownika:** \`${roblox.data.name}\`\n> **Wyświetlana nazwa:** \`${roblox.data.displayName}\`\n> **ID Konta:** \`${robloxId}\`\n> **Data rejestracji:** ${formatPolishDate(roblox.data.created)}\n> **Wiek konta:** ${ageInfo.text}\n> **Profil:** [Kliknij aby otworzyć](https://www.roblox.com/users/${robloxId}/profile)`, inline: false }
            );

            // 3. Sekcja Blokad
            const banData = await db.get(`ban_${robloxId}`);
            if (banData) {
                let statusBana = `> **Typ:** Permanentny 🚫\n`;
                if (banData.expires) {
                    const timeLeft = banData.expires - Date.now();
                    statusBana = timeLeft > 0 
                        ? `> **Typ:** Czasowy ⏳ (Wygaśnie za: ${Math.round(timeLeft / 60000)} min)\n`
                        : `> **Typ:** Przedawniony / Do czyszczenia ⏱️\n`;
                }
                statusBana += `> **Powód:** \`${banData.reason}\`\n> **Nadał:** <@${banData.moderator}>`;
                embed.addFields({ name: '🛑 Status Blokady Gry', value: statusBana, inline: false }).setColor('#e74c3c');
            } else {
                embed.addFields({ name: '🛑 Status Blokady Gry', value: `> Czysty. Brak aktywnych blokad w bazie danych. ✅`, inline: false });
            }
        } else {
            embed.addFields({ name: '🎮 Połączone Konto Roblox', value: `> Powiązane ID: \`${robloxId}\` (Błąd pobierania danych z API Roblox)`, inline: false });
        }
    } else {
        embed.addFields(
            { name: '🎮 Połączone Konto Roblox', value: `> ❌ Ten użytkownik nie przeszedł jeszcze procesu weryfikacji.`, inline: false },
            { name: '🛑 Status Blokady Gry', value: `> Brak danych (konto niezweryfikowane)`, inline: false }
        );
    }

    await i.editReply({ embeds: [embed] });
}

// ====================== KOMENDY INNE ======================

async function handleUnlink(i) {
    const rid = i.options.getString('id').trim();
    const dId = await db.get(`robloxUser_${rid}`);
    if (dId) {
        await db.delete(`robloxUser_${rid}`);
        await db.delete(`user_${dId}`);
        
        const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
        if (guild) {
            const member = await guild.members.fetch(dId).catch(() => null);
            if (member) await member.roles.remove(CONFIG.ROLE_OBYWATEL).catch(() => {});
        }
        console.log(`🔓 Odłączono konto Roblox ${rid} od Discord ${dId}`);
        return i.reply({ content: `✅ Rozłączono powiązanie konta o ID: ${rid}.`, flags: MessageFlags.Ephemeral });
    }
    i.reply({ content: "❌ Podane ID konta nie figuruje w naszej bazie danych.", flags: MessageFlags.Ephemeral });
}

// ====================== ROZBUDOWANA WERYFIKACJA (LOGI + PANELE) ======================

async function setupVerification(i) {
    const embed = new EmbedBuilder()
        .setTitle('🔑 Bramka Weryfikacyjna — Łomża Roleplay')
        .setDescription('Witamy na naszym serwerze! Aby uzyskać pełen dostęp do kanałów oraz statusu obywatela, musisz zsynchronizować swoje konto Discord z profilem Roblox.\n\n**Instrukcja krok po kroku:**\n1️⃣ Kliknij przycisk **Rozpocznij weryfikację**.\n2️⃣ Wpisz swoje numeryczne ID konta Roblox.\n3️⃣ Bot wylosuje słowo, które musisz wkleić do swojego **opisu (About)** na profilu Roblox.\n4️⃣ Po zmianie statusu kliknij zatwierdzenie. Podanie zostanie wysłane do akceptacji zarządu.')
        .setThumbnail(i.guild.iconURL({ dynamic: true }))
        .setColor('#2b2d31')
        .setFooter({ text: 'Łomża Roleplay • Bezpieczna weryfikacja', iconURL: i.guild.iconURL() });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('start_verify')
            .setLabel('Rozpocznij weryfikację')
            .setEmoji('🔐')
            .setStyle(ButtonStyle.Success)
    );
    await i.channel.send({ embeds: [embed], components: [row] });
    await i.reply({ content: "✅ Panel weryfikacji został pomyślnie wygenerowany.", flags: MessageFlags.Ephemeral });
}

async function startVerifyModal(i) {
    const modal = new ModalBuilder().setCustomId('modal_verify').setTitle('Dane profilu Roblox');
    const input = new TextInputBuilder()
        .setCustomId('roblox_id')
        .setLabel('Wpisz swoje numeryczne ID konta Roblox')
        .setPlaceholder('Przykład: 48291039')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleVerifySubmit(i) {
    const rid = i.fields.getTextInputValue('roblox_id').trim().replace(/\D/g, '');
    if(!rid) return i.reply({ content: "❌ Podane ID musi składać się wyłącznie z cyfr.", flags: MessageFlags.Ephemeral });

    const word = ["lomza", "kawa", "niebo", "rower", "zegar", "rp", "polska", "miasto"][Math.floor(Math.random()*8)];
    pendingVerifications.set(i.user.id, { rid, word });
    
    const embed = new EmbedBuilder()
        .setTitle('🔑 Następny krok weryfikacji')
        .setDescription(`Wklej poniższe słowo kluczowe do swojego **opisu (About/Description)** na profilu Roblox:\n\n> Słowo kluczowe: **\`${word}\`**\n\nPo zaktualizowaniu profilu, kliknij przycisk poniżej, aby system sprawdził zmiany.`)
        .addFields({ name: '🔗 Twój profil', value: `[Kliknij tutaj, aby przejść do profilu](https://www.roblox.com/users/${rid}/profile)` })
        .setColor('#f1c40f');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('check_profile')
            .setLabel('Sprawdź i wyślij zgłoszenie')
            .setStyle(ButtonStyle.Primary)
    );
    await i.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function checkRobloxProfile(i) {
    const session = pendingVerifications.get(i.user.id);
    if (!session) return i.reply({ content: "❌ Twoja sesja wygasła. Spróbuj ponownie.", flags: MessageFlags.Ephemeral });
    
    const roblox = await getRobloxInfo(session.rid);
    if (!roblox.success) return i.reply({ content: "❌ Błąd połączenia z API Roblox. Spróbuj za chwilę.", flags: MessageFlags.Ephemeral });
    
    if (!(roblox.data.description || "").toLowerCase().includes(session.word)) {
        return i.reply({ content: `❌ Nie odnaleziono słowa \`${session.word}\` w Twoim opisie. Upewnij się, że zapisałeś zmiany na Roblox!`, flags: MessageFlags.Ephemeral });
    }

    try {
        const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
        if (!guild) return i.reply({ content: "❌ Wystąpił błąd komunikacji wewnętrznej.", flags: MessageFlags.Ephemeral });

        const chan = await guild.channels.fetch(CONFIG.LOGS_CHECK).catch(() => null);
        if (chan && typeof chan.send === 'function' && chan.isTextBased()) {
            const ageInfo = getAccountAge(roblox.data.created);
            
            const embed = new EmbedBuilder()
                .setTitle('📩 Nowy profil oczekuje na weryfikację')
                .setThumbnail(roblox.avatar)
                .setColor(ageInfo.suspect ? '#e74c3c' : '#3498db')
                .setDescription(`Użytkownik pomyślnie przeszedł etap automatycznego sprawdzania opisu.`)
                .addFields(
                    { name: '👤 Użytkownik Discord', value: `> **Wzmianka:** ${i.user}\n> **Tag:** \`${i.user.username}\`\n> **ID:** \`${i.user.id}\``, inline: false }, 
                    { name: '🎮 Profil Roblox', value: `> **Nazwa:** \`${roblox.data.name}\`\n> **Wyświetlana nazwa:** \`${roblox.data.displayName}\`\n> **ID Konta:** \`${session.rid}\`\n> **Utworzone:** \`${formatPolishDate(roblox.data.created)}\`\n> **Wiek:** ${ageInfo.text}`, inline: false }
                )
                .setTimestamp();

            if (ageInfo.suspect) {
                embed.addFields({ name: '⚠️ Ostrzeżenie systemu', value: `> **Konto Roblox zostało założone niedawno. Zalecana ostrożność!**` });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`acc_${i.user.id}_${session.rid}`).setLabel('Akceptuj Obywatela').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId(`rej_${i.user.id}_${session.rid}`).setLabel('Odrzuć Podanie').setStyle(ButtonStyle.Danger).setEmoji('❌')
            );
            await chan.send({ embeds: [embed], components: [row] });
        } else {
            return i.reply({ content: "❌ Błąd struktury logów po stronie bota.", flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        return i.reply({ content: "❌ Wystąpił nieoczekiwany błąd zapisu.", flags: MessageFlags.Ephemeral });
    }

    await i.reply({ content: "✅ Twój profil został wysłany do weryfikacji przez Administrację Serwera. Oczekuj na odpowiedź!", flags: MessageFlags.Ephemeral });
}

async function adminDecision(i) {
    const [action, dId, rid] = i.customId.split('_');
    const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
    if (!guild) return i.reply({ content: "❌ Błąd krytyczny serwera.", flags: MessageFlags.Ephemeral });

    const member = await guild.members.fetch(dId).catch(() => null);
    const roblox = await getRobloxInfo(rid);
    const logChan = await guild.channels.fetch(CONFIG.LOGS_VERIFY).catch(() => null);

    if (action === 'acc') {
        await db.set(`user_${dId}`, rid);
        await db.set(`robloxUser_${rid}`, dId);
        if (member) await member.roles.add(CONFIG.ROLE_OBYWATEL).catch(() => {});

        if (logChan && typeof logChan.send === 'function') {
            const logEmbed = new EmbedBuilder()
                .setTitle('🟢 Akceptacja Weryfikacji')
                .setThumbnail(roblox.avatar)
                .setColor('#2ecc71')
                .addFields(
                    { name: '👥 Zweryfikowany gracz', value: `> **Discord:** <@${dId}>\n> **Roblox:** [${roblox.data?.name || rid}](https://www.roblox.com/users/${rid}/profile) (\`${rid}\`)`, inline: true },
                    { name: '🛠️ Odpowiedzialny administrator', value: `> **Wzmianka:** ${i.user}\n> **ID:** \`${i.user.id}\``, inline: true }
                )
                .setTimestamp();
            await logChan.send({ embeds: [logEmbed] }).catch(() => {});
        }
        if (member) member.send("✅ Twoja weryfikacja na **Lomza RP** została zaakceptowana przez administrację! Przyznano rolę Obywatela.").catch(() => {});
        await i.update({ content: `✅ Zaakceptowano wniosek użytkownika <@${dId}>.`, components: [] });
    } else {
        if (logChan && typeof logChan.send === 'function') {
            const logEmbed = new EmbedBuilder()
                .setTitle('🔴 Odrzucenie Weryfikacji')
                .setThumbnail(roblox.avatar)
                .setColor('#e74c3c')
                .addFields(
                    { name: '👥 Odrzucony użytkownik', value: `> **Discord:** <@${dId}>\n> **Roblox:** [\`${rid}\`](https://www.roblox.com/users/${rid}/profile)`, inline: true },
                    { name: '🛠️ Odpowiedzialny administrator', value: `> **Wzmianka:** ${i.user}`, inline: true }
                )
                .setTimestamp();
            await logChan.send({ embeds: [logEmbed] }).catch(() => {});
        }
        if (member) member.send("❌ Twoja weryfikacja na **Lomza RP** została odrzucona przez administrację. Spróbuj ponownie upewniając się, że podajesz właściwe dane.").catch(() => {});
        await i.update({ content: `❌ Odrzucono wniosek użytkownika <@${dId}>.`, components: [] });
    }
}

// ====================== ODNOWIONY SYSTEM BANÓW (STYL ZE ZDJĘCIA) ======================

async function handleBan(i, perm) {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const rid = i.options.getString('id').trim();
    const reason = i.options.getString('powod');
    
    let mins = null;
    let expiry = null;
    let timeStr = "Na zawsze";
    let expiryStr = "Nigdy";

    if (!perm) {
        mins = i.options.getInteger('czas');
        expiry = Date.now() + (mins * 60000);
        
        if (mins >= 1440) {
            timeStr = `${Math.round(mins / 1440)}d`;
        } else {
            timeStr = `${mins}m`;
        }
        
        const unixTimestamp = Math.floor(expiry / 1000);
        expiryStr = `<t:${unixTimestamp}:F>`; 
    }

    await db.set(`ban_${rid}`, { reason, expires: expiry, moderator: i.user.id, timestamp: Date.now() });
    const roblox = await getRobloxInfo(rid);

    const banLog = i.guild ? await i.guild.channels.fetch(CONFIG.LOGS_BAN).catch(() => null) : null;
    if (banLog && typeof banLog.send === 'function') {
        
        const embed = new EmbedBuilder()
            .setTitle('🔐 Zbanowano Gracza')
            .setColor('#107bc4') // Oryginalny błękitny odcień paska ze zdjęcia
            .setThumbnail(roblox.avatar || 'https://www.roblox.com/headshot-thumbnail/image?userId=1&width=420&height=420&format=png')
            .setDescription(
                `Zbanowany gracz nie może grać do czasu upłynięcia blokady.\n` +
                `Gracz **${roblox.data?.name || 'Nieznany'} (${rid})** został zablokowany na **${timeStr}**.\n` +
                `Blokada minie ${expiryStr}\n\n` +
                `**Powód** ${reason}\n\n` +
                `Zbanowano przez ${i.user.username}`
            );
        
        const dId = await db.get(`robloxUser_${rid}`);
        const pingContent = dId ? `<@${dId}>` : `Roblox ID: ${rid}`;
        
        await banLog.send({ content: pingContent, embeds: [embed] }).catch(() => {});
    }

    const dId = await db.get(`robloxUser_${rid}`);
    if (dId) {
        const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
        if (guild) {
            const member = await guild.members.fetch(dId).catch(() => null);
            if (member) {
                const pvEmbed = new EmbedBuilder()
                    .setTitle("🚫 Zostałeś Zablokowany globalnie w grze")
                    .setColor('#ff0000')
                    .setDescription(`Twój dostęp do rozgrywki na serwerze **Lomza RP** został zablokowany.\n\n> **Powód:** \`${reason}\`\n> **Ważność:** ${timeStr}\n> **Wygasa:** ${expiryStr}\n\nJeśli uważasz, że kara została nadana niesłusznie, możesz złożyć oficjalną apelację klikając poniższy przycisk.`)
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`appeal_btn_${rid}`)
                        .setLabel('Złóż apelację od blokady')
                        .setStyle(ButtonStyle.Danger)
                );
                await member.send({ embeds: [pvEmbed], components: [row] }).catch(() => {});
            }
        }
    }
    
    await i.editReply(`✅ Pomyślnie zautoryzowano i zarejestrowano blokadę na czas **${timeStr}**.`);
}

// ====================== APELACJE ======================

async function startAppealModal(i) {
    const rid = i.customId.split('_')[2];
    const modal = new ModalBuilder()
        .setCustomId(`modal_appeal_${rid}`)
        .setTitle('Formularz Apelacyjny');
    const input = new TextInputBuilder()
        .setCustomId('appeal_text')
        .setLabel('Napisz dlaczego powinniśmy Cię odbanować')
        .setPlaceholder('Przedstaw dokładnie całą sytuację...')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
}

async function handleAppealSubmit(i) {
    const rid = i.customId.split('_')[2];
    const text = i.fields.getTextInputValue('appeal_text');
    const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
    
    if (guild) {
        const chan = await guild.channels.fetch(CONFIG.LOGS_APPEAL).catch(() => null);
        if (chan && typeof chan.send === 'function') {
            const roblox = await getRobloxInfo(rid);
            const originalBan = await db.get(`ban_${rid}`) || { reason: "Brak danych o powodzie w bazie" };

            const embed = new EmbedBuilder()
                .setTitle('⚖️ Wpłynęła Nowa Apelacja od kary')
                .setThumbnail(roblox.avatar)
                .setColor('#f39c12')
                .addFields(
                    { name: '👤 Dane Apelującego', value: `> **Konto Discord:** ${i.user}\n> **ID Roblox:** \`${rid}\`\n> **Nazwa Roblox:** \`${roblox.data?.name || 'Nieznana'}\``, inline: false }, 
                    { name: '🚫 Pierwotny Powód Blokady', value: `> \`${originalBan.reason}\``, inline: false },
                    { name: '💬 Treść Uzasadnienia Gracza', value: `\`\`\`text\n${text}\n\`\`\``, inline: false }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`app_acc_${rid}_${i.user.id}`).setLabel('Zaakceptuj i Odbanuj').setStyle(ButtonStyle.Success).setEmoji('🔓'),
                new ButtonBuilder().setCustomId(`app_rej_${rid}_${i.user.id}`).setLabel('Odrzuć Apelację').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );
            await chan.send({ embeds: [embed], components: [row] }).catch(() => {});
        }
    }
    await i.reply({ content: "✅ Twoje odwołanie zostało przekazane administracji wyższej. Zostaniesz powiadomiony o decyzji.", flags: MessageFlags.Ephemeral });
}

async function adminAppealDecision(i) {
    const [,, rid, dId] = i.customId.split('_');
    const guild = i.guild || await client.guilds.fetch(CONFIG.GUILD_ID).catch(() => null);
    if (!guild) return i.reply({ content: "❌ Błąd krytyczny struktury serwera.", flags: MessageFlags.Ephemeral });

    const member = await guild.members.fetch(dId).catch(() => null);

    if (i.customId.startsWith('app_acc')) {
        await db.delete(`ban_${rid}`);
        if (member) {
            await member.send("✅ Twoja apelacja została pomyślnie **zaakceptowana**. Twoja blokada w grze została zdjęta!").catch(() => {});
        }
        await i.update({ content: `✅ Zaakceptowano odwołanie gracza. Zdjęto blokadę z konta Roblox ID: ${rid}.`, components: [] });
    } else {
        if (member) {
            await member.send("❌ Twoja apelacja została **odrzucona** przez zarząd projektu. Blokada pozostaje aktywna.").catch(() => {});
        }
        await i.update({ content: `❌ Odrzucono odwołanie gracza. Blokada dla konta Roblox ID: ${rid} pozostaje bez zmian.`, components: [] });
    }
}

// ====================== URUCHOMIENIE ======================

client.login(CONFIG.TOKEN);
app.listen(CONFIG.PORT, () => console.log(`🚀 API działa na porcie ${CONFIG.PORT}`));
