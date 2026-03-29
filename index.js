import { eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { extension_settings, getContext } from "../../../extensions.js";

const extName = "CustomChatStyles";

const THEMES = {
    "Telegram (Темная)": { phoneBg: "#0e1621", phoneIn: "#182533", phoneOut: "#2b5278", textIn: "#ffffff", textOut: "#ffffff", streamBg: "#18181b", streamBorder: "#b38dee", streamText: "#efeff1", sysBg: "#0f1928", sysBorder: "#4da6ff", sysText: "#e6f2ff" },
    "iMessage (Светлая)": { phoneBg: "#f3f3f3", phoneIn: "#e5e5ea", phoneOut: "#0b84ff", textIn: "#000000", textOut: "#ffffff", streamBg: "#ffffff", streamBorder: "#a970ff", streamText: "#000000", sysBg: "#f5f5f5", sysBorder: "#ff8c00", sysText: "#333333" },
    "Discord (Темная)": { phoneBg: "#313338", phoneIn: "#2b2d31", phoneOut: "#5865f2", textIn: "#dbdee1", textOut: "#ffffff", streamBg: "#313338", streamBorder: "#5865f2", streamText: "#dbdee1", sysBg: "#1e1f22", sysBorder: "#fbbc05", sysText: "#dbdee1" },
    "WhatsApp (Светлая)": { phoneBg: "#efeae2", phoneIn: "#ffffff", phoneOut: "#d9fdd3", textIn: "#111b21", textOut: "#111b21", streamBg: "#f0f2f5", streamBorder: "#25d366", streamText: "#111b21", sysBg: "#0d1418", sysBorder: "#00ff00", sysText: "#00ff00" }
};

const defaultSettings = {
    phoneBg: "#0e1621", phoneIn: "#182533", phoneOut: "#2b5278",
    textIn: "#ffffff", textOut: "#ffffff",
    streamBg: "#18181b", streamBorder: "#9146FF", streamText: "#efeff1",
    sysBg: "#0f1928", sysBorder: "#4da6ff", sysText: "#e6f2ff",
    currentThemeName: "Telegram (Темная)",
    userThemes: {},
    systemPrompt: `[System Note:
1. Messaging: Wrap smartphone/SMS text in <phone>...</phone>. Wrap stream/live chats in <chat>...</chat>. Use "Name: Message" format inside them.
2. System/RPG Windows: Wrap non-human system messages, AI core alerts, RPG status screens, or terminal logs in <sys>...</sys>. (No "Name:" format needed here).
3. IMPORTANT: You MUST close every tag immediately after the content. An unclosed tag is a critical error.
4. Natural Behavior for Phones: Mimic human texting patterns (abbreviations, pacing).
5. For <sys> tag: Keep the tone robotic, analytical, or game-like.]`
};

if (!extension_settings[extName]) {
    extension_settings[extName] = JSON.parse(JSON.stringify(defaultSettings));
}
const settings = extension_settings[extName];

for (const key in defaultSettings) {
    if (settings[key] === undefined) {
        settings[key] = defaultSettings[key];
    }
}
if (settings.currentThemeName === "custom") {
    settings.currentThemeName = "Telegram (Темная)";
}

function setupRegexBypasses() {
    if (!extension_settings.regex) {
        extension_settings.regex = [];
    }

    const tags = ['phone', 'chat', 'sys'];
    let isModified = false;

    tags.forEach(tag => {
        const scriptName = `CCS - ${tag.charAt(0).toUpperCase() + tag.slice(1)} Tag Bypass`;
        const existingIndex = extension_settings.regex.findIndex(r => r.scriptName === scriptName);

        if (existingIndex === -1) {
            const newRegex = {
                id: `ccs_${tag}_bypass_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                scriptName: scriptName,
                findRegex: `/<${tag}>([\\s\\S]*?)<\\/${tag}>/gim`,
                replaceString: `[${tag}]$1[/${tag}]`,
                trimStrings: [],
                placement: [1, 2],
                disabled: false,
                markdownOnly: true,
                promptOnly: false,
                runOnEdit: false,
                minDepth: null,
                maxDepth: null
            };
            extension_settings.regex.push(newRegex);
            isModified = true;
        }
    });

    if (isModified) {
        saveSettingsDebounced();
        console.log("[CustomChatStyles] Успешно добавлены автоматические Regex обходы (Bypasses).");
    }
}

function updateCssVariables() {
    const root = document.documentElement;
    const s = settings;
    const vars = {
        '--ccs-phone-bg': s.phoneBg, '--ccs-phone-in': s.phoneIn, '--ccs-phone-out': s.phoneOut,
        '--ccs-text-in': s.textIn, '--ccs-text-out': s.textOut,
        '--ccs-stream-bg': s.streamBg, '--ccs-stream-border': s.streamBorder, '--ccs-stream-text': s.streamText,
        '--ccs-sys-bg': s.sysBg, '--ccs-sys-border': s.sysBorder, '--ccs-sys-text': s.sysText
    };
    for (const [key, val] of Object.entries(vars)) root.style.setProperty(key, val);
}

// --- ПАРСИНГ И ОБРАБОТКА ---
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
        } else if (currentSpeaker) {
            currentText.push(cleanLine);
        }
    }
    if (currentSpeaker) bubbles.push({ speaker: currentSpeaker, text: currentText.join('<br>') });
    return bubbles;
}

function processMessage(messageId) {
    const msgEl = document.querySelector(`.mes[mesid="${messageId}"] .mes_text`);
    if (!msgEl || msgEl.querySelector('.ccs-container')) return;

    let html = msgEl.innerHTML;

    html = html.replace(/(?:&lt;|\[)phone(?:&gt;|\])/gi, '<phone>').replace(/(?:&lt;|\[)\/phone(?:&gt;|\])/gi, '</phone>');
    html = html.replace(/(?:&lt;|\[)chat(?:&gt;|\])/gi, '<chat>').replace(/(?:&lt;|\[)\/chat(?:&gt;|\])/gi, '</chat>');
    html = html.replace(/(?:&lt;|\[)sys(?:&gt;|\])/gi, '<sys>').replace(/(?:&lt;|\[)\/sys(?:&gt;|\])/gi, '</sys>');

    if (!/<phone>|<chat>|<sys>/i.test(html)) return;

    const userName = (getContext().name1 || 'You').toLowerCase();

    html = html.replace(/<phone>([\s\S]*?)<\/phone>/gi, (m, content) => {
        const bubbles = parseChatBlocks(content);
        const inner = bubbles.map(b => {
            const isUser = b.speaker.toLowerCase() === userName || ['you', 'user', 'я'].includes(b.speaker.toLowerCase());
            return `<div class="custom-phone-message ${isUser ? 'custom-phone-msg-right' : 'custom-phone-msg-left'}">
                <span class="phone-speaker">${b.speaker}</span>${b.text}</div>`;
        }).join('');
        return `<div class="custom-phone-container ccs-container">${inner}</div>`;
    });

    html = html.replace(/<chat>([\s\S]*?)<\/chat>/gi, (m, content) => {
        const bubbles = parseChatBlocks(content);
        const colors = ['#FF4500', '#2E8B57', '#1E90FF', '#FF69B4', '#8A2BE2'];
        const inner = bubbles.map(b => {
            const color = colors[[...b.speaker].reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length];
            return `<div class="custom-stream-message"><span class="stream-user" style="color:${color}">${b.speaker}:</span> ${b.text}</div>`;
        }).join('');
        return `<div class="custom-stream-container ccs-container">${inner}</div>`;
    });

    html = html.replace(/<sys>([\s\S]*?)<\/sys>/gi, (m, content) => {
        let cleanContent = content.replace(/<\/p>\s*<p>/gi, '<br>').replace(/<\/?p>/gi, '').trim();
        cleanContent = cleanContent.replace(/\n/g, '<br>');
        return `<div class="custom-sys-container ccs-container">
                    <div class="custom-sys-header">SYSTEM NOTIFICATION</div>
                    <div class="custom-sys-content">${cleanContent}</div>
                </div>`;
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
    if (settings.currentThemeName.startsWith('user_')) {
        $('#ccs-btn-delete').show();
    } else {
        $('#ccs-btn-delete').hide();
    }
}

function syncInputs() {
    const keys = ['phoneBg', 'phoneIn', 'phoneOut', 'textIn', 'textOut', 'streamBg', 'streamBorder', 'streamText', 'sysBg', 'sysBorder', 'sysText'];
    keys.forEach(k => $(`#ccs-${k}`).val(settings[k]));
}

function loadSettingsUI() {
    const html = `
    <div id="ccs-settings" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Custom Chat Styles</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>

        <div class="inline-drawer-content" style="padding: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <div style="display:flex; gap:5px; width: 100%;">
                    <select id="ccs-theme-select" class="text_pole" style="flex-grow: 1;"></select>
                    <div id="ccs-btn-add" class="menu_button fa-solid fa-plus" title="Добавить новую тему"></div>
                    <div id="ccs-btn-delete" class="menu_button fa-solid fa-trash" title="Удалить тему" style="color:red; display:none;"></div>
                </div>
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
                <div class="ccs-color-item"><span>Рамка/Свечение</span> <input type="color" class="ccs-color-swatch" id="ccs-sysBorder"></div>
                <div class="ccs-color-item"><span>Текст</span> <input type="color" class="ccs-color-swatch" id="ccs-sysText"></div>
                <div></div>
            </div>

            <div style="margin-top:15px;">
                <div style="font-size:0.9em; opacity:0.7; margin-bottom: 5px;">Системный Промпт:</div>
                <textarea id="ccs-prompt" class="text_pole" style="width:100%; height:100px; font-size:0.85em; resize: vertical;"></textarea>
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

            const colorKeys = ['phoneBg', 'phoneIn', 'phoneOut', 'textIn', 'textOut', 'streamBg', 'streamBorder', 'streamText', 'sysBg', 'sysBorder', 'sysText'];
            colorKeys.forEach(k => { settings[k] = THEMES["Telegram (Темная)"][k]; });

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
            // Копируем ТОЛЬКО цвета из выбранной темы, чтобы не сломать системные переменные
            const colorKeys = ['phoneBg', 'phoneIn', 'phoneOut', 'textIn', 'textOut', 'streamBg', 'streamBorder', 'streamText', 'sysBg', 'sysBorder', 'sysText'];
            colorKeys.forEach(k => {
                settings[k] = theme[k] !== undefined ? theme[k] : defaultSettings[k];
            });

            syncInputs();
            updateCssVariables();
            updateThemeDropdown();
            saveSettingsDebounced();
        }
    });

    const bind = (id) => {
        $(`#ccs-${id}`).on('input', function() {
            const val = $(this).val();

            settings[id] = val;

            if (settings.currentThemeName.startsWith('user_')) {
                const userThemeName = settings.currentThemeName.replace('user_', '');
                if (settings.userThemes[userThemeName]) {
                    settings.userThemes[userThemeName][id] = val;
                }
            }

            updateCssVariables();
            saveSettingsDebounced();
        });
    };

    ['phoneBg', 'phoneIn', 'phoneOut', 'textIn', 'textOut', 'streamBg', 'streamBorder', 'streamText', 'sysBg', 'sysBorder', 'sysText'].forEach(bind);

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
