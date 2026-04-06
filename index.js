import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";

const extName = "CustomChatStyles";

const COLOR_KEYS = [
    'phoneBg', 'phoneIn', 'phoneOut', 'textIn', 'textOut',
    'streamBg', 'streamBorder', 'streamText',
    'sysBg', 'sysBorder', 'sysText',
    'achBg', 'achBorder', 'achText',
    'thBg', 'thBorder', 'thText'
];

const THEMES = {
    "Telegram (Темная)": {
        phoneBg: "#0e1621", phoneIn: "#182533", phoneOut: "#2b5278", textIn: "#ffffff", textOut: "#ffffff",
        streamBg: "#18181b", streamBorder: "#b38dee", streamText: "#efeff1",
        sysBg: "#0d1117", sysBorder: "#4da6ff", sysText: "#e6f2ff",
        achBg: "#1e1e1e", achBorder: "#f1c40f", achText: "#ffffff",
        thBg: "rgba(255,255,255,0.06)", thBorder: "#6b84a0", thText: "#a6b3c2"
    },
    "iMessage (Светлая)": {
        phoneBg: "#f3f3f3", phoneIn: "#e5e5ea", phoneOut: "#0b84ff", textIn: "#000000", textOut: "#ffffff",
        streamBg: "#ffffff", streamBorder: "#a970ff", streamText: "#000000",
        sysBg: "#1a1a1a", sysBorder: "#ff8c00", sysText: "#ffffff",
        achBg: "#ffffff", achBorder: "#ffcc00", achText: "#000000",
        thBg: "rgba(0,0,0,0.05)", thBorder: "#8e8e93", thText: "#555555"
    },
    "Discord (Темная)": {
        phoneBg: "#313338", phoneIn: "#2b2d31", phoneOut: "#5865f2", textIn: "#dbdee1", textOut: "#ffffff",
        streamBg: "#313338", streamBorder: "#5865f2", streamText: "#dbdee1",
        sysBg: "#1e1f22", sysBorder: "#fbbc05", sysText: "#dbdee1",
        achBg: "#2b2d31", achBorder: "#fee75c", achText: "#dbdee1",
        thBg: "rgba(43,45,49,0.8)", thBorder: "#80848e", thText: "#b5bac1"
    }
};

const defaultSettings = {
    ...THEMES["Telegram (Темная)"],
    currentThemeName: "Telegram (Темная)",
    userThemes: {},
    systemPrompt: `[USE TAGS STRICTLY IN CONTEXT. Accidental use of <sys>, <ach>, or <thought> without a plot-related need is a CRITICAL ERROR.
1. Smartphone: <phone>Name: Text</phone>. Each message is a new line.
2. Stream: <chat>Name: Text</chat>. Each message is a new line.
3. System: <sys>Text <btn>Action</btn></sys>. For non-game notifications only.
4. Achievements: <ach>Title | Description</ach>. For important or funny moments only.
5. Thoughts: <thought>Text</thought>. WRITE STRICTLY AT THE VERY END OF THE MESSAGE (after the main text).
IMPORTANT: Always close tags. Don't use tags unless the situation requires it.`
};

if (!extension_settings[extName]) extension_settings[extName] = JSON.parse(JSON.stringify(defaultSettings));
const settings = extension_settings[extName];

for (const key in defaultSettings) {
    if (settings[key] === undefined) settings[key] = defaultSettings[key];
}
if (settings.currentThemeName === "custom") settings.currentThemeName = "Telegram (Темная)";

function setupRegexBypasses() {
    if (!extension_settings.regex) extension_settings.regex = [];
    const tags = ['phone', 'chat', 'sys', 'btn', 'ach', 'thought'];
    let isModified = false;

    tags.forEach(tag => {
        const scriptName = `CCS - ${tag.charAt(0).toUpperCase() + tag.slice(1)} Tag Bypass`;
        if (extension_settings.regex.findIndex(r => r.scriptName === scriptName) === -1) {
            extension_settings.regex.push({
                id: `ccs_${tag}_bypass_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                scriptName: scriptName,
                findRegex: `/<${tag}>([\\s\\S]*?)<\\/${tag}>/gim`,
                replaceString: `[${tag}]$1[/${tag}]`,
                trimStrings: [], placement: [1, 2], disabled: false,
                markdownOnly: true, promptOnly: false, runOnEdit: false
            });
            isModified = true;
        }
    });

    if (isModified) saveSettingsDebounced();
}

function updateCssVariables() {
    const root = document.documentElement;
    COLOR_KEYS.forEach(k => {
        const cssVar = '--ccs-' + k.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
        root.style.setProperty(cssVar, settings[k]);
    });
}

function cleanTagsContent(html) {
    return html.replace(/^(?:<p>|<\/?br\s*\/?>|\s)+|(?:<\/p>|<\/?br\s*\/?>|\s)+$/gi, '').trim();
}

function parseChatBlocks(content) {
    let clean = content.replace(/<\/p>\s*<p>/gi, '<br>').replace(/<\/?p>/gi, '').trim();
    let lines = clean.split(/<br\s*\/?>|\n/i).map(l => l.trim()).filter(l => l !== '');
    let bubbles = [];
    let currentSpeaker = null, currentText = [];

    for (let line of lines) {
        let cleanLine = line.replace(/<(?!\/?(b|i|u|s|em|strong|del)[>])[^>]+>/gi, '');
        let match = cleanLine.match(/^([^:]{1,40}):\s*([\s\S]*)$/);
        if (match) {
            if (currentSpeaker !== null) bubbles.push({ speaker: currentSpeaker, text: currentText.join('<br>') });
            currentSpeaker = match[1].trim();
            currentText = [match[2].trim()];
        } else if (currentSpeaker) currentText.push(cleanLine);
    }
    if (currentSpeaker) bubbles.push({ speaker: currentSpeaker, text: currentText.join('<br>') });
    return bubbles;
}

function processMessage(messageId) {
    const msgEl = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgEl || msgEl.querySelector('.ccs-container')) return;

    let html = msgEl.innerHTML;

    const tagsToRestore = ['phone', 'chat', 'sys', 'btn', 'ach', 'thought'];
    tagsToRestore.forEach(tag => {
        const regexOpen = new RegExp(`(?:&lt;|\\[)${tag}(?:&gt;|\\])`, 'gi');
        const regexClose = new RegExp(`(?:&lt;|\\[)\\/${tag}(?:&gt;|\\])`, 'gi');
        html = html.replace(regexOpen, `<${tag}>`).replace(regexClose, `</${tag}>`);
    });

    if (!/<(?:phone|chat|sys|ach|thought)>/i.test(html)) return;

    const userName = (getContext().name1 || 'You').toLowerCase();

    // 1. ТЕЛЕФОН
    html = html.replace(/<phone>([\s\S]*?)<\/phone>/gi, (m, content) => {
        const bubbles = parseChatBlocks(cleanTagsContent(content));
        const inner = bubbles.map(b => {
            const isUser = b.speaker.toLowerCase() === userName || ['you', 'user', 'я'].includes(b.speaker.toLowerCase());
            const check = `<span class="phone-checks"><i class="fa-solid fa-check-double"></i></span>`;
            return `<div class="custom-phone-message ${isUser ? 'custom-phone-msg-right' : 'custom-phone-msg-left'}">
                <span class="phone-speaker">${b.speaker}</span>${b.text}${check}</div>`;
        }).join('');

        return `<div class="custom-phone-container ccs-container">
                    <div class="custom-phone-topbar">
                        <span><i class="fa-solid fa-signal" style="margin-right:3px;"></i> LTE</span>
                        <span><i class="fa-solid fa-battery-three-quarters"></i></span>
                    </div>
                    <div class="custom-phone-messages">${inner}</div>
                    <div class="custom-phone-input-bar">
                        <i class="fa-solid fa-plus"></i>
                        <div class="custom-phone-input-fake">iMessage</div>
                        <i class="fa-solid fa-microphone"></i>
                    </div>
                </div>`;
    });

    // 2. ЧАТ СТРИМА (Эстетичный с динамическими зрителями)
    html = html.replace(/<chat>([\s\S]*?)<\/chat>/gi, (m, content) => {
        const cleanStr = cleanTagsContent(content);
        const bubbles = parseChatBlocks(cleanStr);
        const colors = ['#FF4500', '#2E8B57', '#1E90FF', '#FF69B4', '#8A2BE2', '#FFA500', '#20B2AA'];
        const inner = bubbles.map(b => {
            const color = colors[[...b.speaker].reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length];
            return `<div class="custom-stream-message"><span class="stream-user" style="color:${color}">${b.speaker}:</span><span class="stream-text-content">${b.text}</span></div>`;
        }).join('');

        // Генерация реалистичного числа зрителей на основе содержимого чата
        const hash = [...cleanStr].reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const dynamicViewers = (1.2 + (hash % 88) / 10).toFixed(1) + 'k';

        return `<div class="custom-stream-container ccs-container">
                    <div class="custom-stream-header">
                        <div style="display:flex; gap:12px; align-items:center;">
                            <span class="stream-live-badge">LIVE</span>
                        </div>
                        <span style="opacity:0.5; font-size:11px; font-weight:700;">TOP CHAT</span>
                    </div>
                    <div class="custom-stream-messages">
                        ${inner}
                    </div>
                </div>`;
    });

    // 3. СИСТЕМА
    html = html.replace(/<sys>([\s\S]*?)<\/sys>/gi, (m, content) => {
        let cleanStr = cleanTagsContent(content);
        let buttonsHtml = '';
        cleanStr = cleanStr.replace(/<btn>([\s\S]*?)<\/btn>/gi, (m, btnText) => {
            buttonsHtml += `<div class="sys-action-btn">${btnText.trim()}</div>`;
            return '';
        });
        cleanStr = cleanTagsContent(cleanStr).replace(/\n/g, '<br>');
        const btnsContainer = buttonsHtml ? `<div class="custom-sys-buttons">${buttonsHtml}</div>` : '';
        return `<div class="custom-sys-container ccs-container">
                    <div class="custom-sys-topbar"><span class="custom-sys-title">SYSTEM ALERT</span></div>
                    <div class="custom-sys-content">${cleanStr}</div>
                    ${btnsContainer}
                </div>`;
    });

    // 4. АЧИВКИ
    html = html.replace(/<ach>([\s\S]*?)<\/ach>/gi, (m, content) => {
        let cleanStr = cleanTagsContent(content).replace(/<\/?p>/gi, '').trim();
        let parts = cleanStr.split(/\||:/);
        let title = "ДОСТИЖЕНИЕ ПОЛУЧЕНО";
        let desc = cleanStr;

        if (parts.length > 1) {
            title = parts[0].trim();
            desc = parts.slice(1).join(':').trim();
        }

        return `<div class="custom-ach-container ccs-container">
                    <div class="custom-ach-icon-box">
                        <div class="custom-ach-sparkle s1">✦</div>
                        <div class="custom-ach-sparkle s2">✦</div>
                        <div class="custom-ach-sparkle s3">✦</div>
                        <div class="custom-ach-icon">✦</div>
                    </div>
                    <div class="custom-ach-text-wrap">
                        <div class="custom-ach-title">${title}</div>
                        <div class="custom-ach-desc">${desc}</div>
                    </div>
                </div>`;
    });

    // 5. МЫСЛИ
    html = html.replace(/<thought>([\s\S]*?)<\/thought>/gi, (m, content) => {
        let cleanStr = cleanTagsContent(content).replace(/\n/g, '<br>');
        return `<div class="custom-thought-container ccs-container">${cleanStr}</div>`;
    });

    msgEl.innerHTML = html;
}

// --- ИНТЕРФЕЙС ---
function updateThemeDropdown() {
    const select = $('#ccs-theme-select');
    if (!select.length) return;
    select.empty();

    for (const t in THEMES) select.append($('<option>', { value: t, text: t }));
    for (const t in settings.userThemes) select.append($('<option>', { value: 'user_' + t, text: '⭐ ' + t }));

    select.val(settings.currentThemeName);
    if (settings.currentThemeName.startsWith('user_')) $('#ccs-btn-delete').show();
    else $('#ccs-btn-delete').hide();
}

function syncInputs() {
    COLOR_KEYS.forEach(k => $(`#ccs-${k}`).val(settings[k]));
}

function loadSettingsUI() {
    const html = `
    <div id="ccs-settings" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Custom Chat Styles</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>

        <div class="inline-drawer-content" style="padding: 10px;">
            <div style="display:flex; gap:5px; margin-bottom:15px; width: 100%;">
                <select id="ccs-theme-select" class="text_pole" style="flex-grow: 1;"></select>
                <div id="ccs-btn-add" class="menu_button fa-solid fa-plus" title="Сохранить как новую тему"></div>
                <div id="ccs-btn-delete" class="menu_button fa-solid fa-trash" title="Удалить тему" style="color:red; display:none;"></div>
            </div>

            <div class="ccs-settings-grid">
                <div style="grid-column: span 2; opacity:0.7; font-size:0.9em; border-bottom:1px solid var(--SmartThemeBorderColor);">ТЕЛЕФОН (&lt;phone&gt;)</div>
                <div class="ccs-color-item"><span>Фон</span> <input type="color" class="ccs-color-swatch" id="ccs-phoneBg"></div>
                <div class="ccs-color-item"><span>Входящий</span> <input type="color" class="ccs-color-swatch" id="ccs-phoneIn"></div>
                <div class="ccs-color-item"><span>Текст In</span> <input type="color" class="ccs-color-swatch" id="ccs-textIn"></div>
                <div class="ccs-color-item"><span>Исходящий</span> <input type="color" class="ccs-color-swatch" id="ccs-phoneOut"></div>
                <div class="ccs-color-item"><span>Текст Out</span> <input type="color" class="ccs-color-swatch" id="ccs-textOut"></div>
                <div></div>

                <div style="grid-column: span 2; opacity:0.7; font-size:0.9em; border-bottom:1px solid var(--SmartThemeBorderColor); margin-top:5px;">СТРИМ ЧАТ (&lt;chat&gt;)</div>
                <div class="ccs-color-item"><span>Фон</span> <input type="color" class="ccs-color-swatch" id="ccs-streamBg"></div>
                <div class="ccs-color-item"><span>Линия</span> <input type="color" class="ccs-color-swatch" id="ccs-streamBorder"></div>
                <div class="ccs-color-item"><span>Текст</span> <input type="color" class="ccs-color-swatch" id="ccs-streamText"></div>
                <div></div>

                <div style="grid-column: span 2; opacity:0.7; font-size:0.9em; border-bottom:1px solid var(--SmartThemeBorderColor); margin-top:5px;">СИСТЕМНОЕ ОКНО (&lt;sys&gt;)</div>
                <div class="ccs-color-item"><span>Фон</span> <input type="color" class="ccs-color-swatch" id="ccs-sysBg"></div>
                <div class="ccs-color-item"><span>Акцент/Кнопки</span> <input type="color" class="ccs-color-swatch" id="ccs-sysBorder"></div>
                <div class="ccs-color-item"><span>Текст</span> <input type="color" class="ccs-color-swatch" id="ccs-sysText"></div>
                <div></div>

                <div style="grid-column: span 2; opacity:0.7; font-size:0.9em; border-bottom:1px solid var(--SmartThemeBorderColor); margin-top:5px;">АЧИВКИ (&lt;ach&gt;)</div>
                <div class="ccs-color-item"><span>Фон</span> <input type="color" class="ccs-color-swatch" id="ccs-achBg"></div>
                <div class="ccs-color-item"><span>Акцент/Звезда</span> <input type="color" class="ccs-color-swatch" id="ccs-achBorder"></div>
                <div class="ccs-color-item"><span>Текст</span> <input type="color" class="ccs-color-swatch" id="ccs-achText"></div>
                <div></div>

                <div style="grid-column: span 2; opacity:0.7; font-size:0.9em; border-bottom:1px solid var(--SmartThemeBorderColor); margin-top:5px;">МЫСЛИ (&lt;thought&gt;)</div>
                <div class="ccs-color-item"><span>Фон (лучше rgba)</span> <input type="text" class="text_pole" id="ccs-thBg" style="width: 70px; height: 22px; font-size: 10px; padding: 0 4px;"></div>
                <div class="ccs-color-item"><span>Линия</span> <input type="color" class="ccs-color-swatch" id="ccs-thBorder"></div>
                <div class="ccs-color-item"><span>Текст</span> <input type="color" class="ccs-color-swatch" id="ccs-thText"></div>
                <div></div>
            </div>

            <div style="margin-top:15px;">
                <div style="font-size:0.9em; opacity:0.7; margin-bottom: 5px;">Системный Промпт:</div>
                <textarea id="ccs-prompt" class="text_pole" style="width:100%; height:130px; font-size:0.85em; resize: vertical;"></textarea>
            </div>
        </div>
    </div>`;

    $("#extensions_settings").append(html);
    updateThemeDropdown();
    syncInputs();
    $('#ccs-prompt').val(settings.systemPrompt);

    $('#ccs-btn-add').on('click', function() {
        const name = prompt("Введите название для вашей новой темы:");
        if (!name || name.trim() === "") return;
        const cleanName = name.trim();

        if (THEMES[cleanName] || settings.userThemes[cleanName]) {
            alert("Тема с таким именем уже существует!");
            return;
        }

        settings.userThemes[cleanName] = { ...settings };
        delete settings.userThemes[cleanName].userThemes;
        delete settings.userThemes[cleanName].currentThemeName;
        delete settings.userThemes[cleanName].systemPrompt;

        settings.currentThemeName = 'user_' + cleanName;
        updateThemeDropdown();
        saveSettingsDebounced();
    });

    $('#ccs-btn-delete').on('click', function() {
        const sel = $('#ccs-theme-select').val();
        if (!sel.startsWith('user_')) return;
        const name = sel.replace('user_', '');
        if (confirm(`Точно удалить вашу тему "${name}"?`)) {
            delete settings.userThemes[name];
            settings.currentThemeName = "Telegram (Темная)";

            COLOR_KEYS.forEach(k => { settings[k] = THEMES["Telegram (Темная)"][k]; });

            updateThemeDropdown();
            syncInputs();
            updateCssVariables();
            saveSettingsDebounced();
        }
    });

    $('#ccs-theme-select').on('change', function() {
        const val = $(this).val();
        settings.currentThemeName = val;
        let theme = THEMES[val] || settings.userThemes[val.replace('user_', '')];

        if (theme) {
            COLOR_KEYS.forEach(k => { settings[k] = theme[k] !== undefined ? theme[k] : defaultSettings[k]; });
            syncInputs();
            updateCssVariables();
            updateThemeDropdown();
            saveSettingsDebounced();
        }
    });

    COLOR_KEYS.forEach(id => {
        $(`#ccs-${id}`).on('input', function() {
            const val = $(this).val();
            settings[id] = val;

            if (settings.currentThemeName.startsWith('user_')) {
                const userThemeName = settings.currentThemeName.replace('user_', '');
                if (settings.userThemes[userThemeName]) settings.userThemes[userThemeName][id] = val;
            }

            updateCssVariables();
            saveSettingsDebounced();
        });
    });

    $('#ccs-prompt').on('input', function() {
        settings.systemPrompt = $(this).val();
        saveSettingsDebounced();
    });
}

// --- ЗАПУСК ---
jQuery(() => {
    setupRegexBypasses();
    updateCssVariables();
    loadSettingsUI();

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (data) => {
        if (settings.systemPrompt?.trim()) {
            data.chat.splice(0, 0, { role: 'system', content: settings.systemPrompt });
        }
    });

    const render = () => setTimeout(() => document.querySelectorAll('.mes').forEach(m => processMessage(m.getAttribute('mesid'))), 100);
    eventSource.on(event_types.CHAT_CHANGED, render);
    eventSource.on(event_types.MESSAGE_UPDATED, render);
    eventSource.on(event_types.MESSAGE_SWIPED, render);

    const obs = new MutationObserver(render);
    const chat = document.getElementById('chat');
    if (chat) obs.observe(chat, { childList: true, subtree: true });

    render();
});
