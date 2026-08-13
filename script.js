/* ============================================================
   JS V4 — PART 1
   BASE GLOBAL · HELPERS · MODE FOSC · MENÚ ⚙ · ANIMACIONS
============================================================ */

/* ------------------------------------------------------------
   ICONES (HTML entities — minimalistes i elegants)
------------------------------------------------------------ */
const ICON_EDIT   = "✎";     // llapis inclinat (Material-friendly)
const ICON_DELETE = "✖";     // eliminar
const ICON_COLOR  = "🎨";     // icona de paleta minimalista
const ICON_MODAL  = "⧉";     // icona de paleta minimalista
const ICON_PIN    = "⚑";     // pin fixat
const ICON_UNPIN  = "⚐";     // pin desfet

const GOOGLE_CLIENT_ID = "195926325439-n1a38feptsfcehpobb9bfhk7fmeg8v4i.apps.googleusercontent.com";
const GOOGLE_SCOPES = "https://www.googleapis.com/auth/drive.file";

let googleAuthenticated = false;
let driveReady = false;
let googleAccessToken = null;  // Guardar el token d'accés
let driveFolderId = null;  // ID de la carpeta d'OrganitzadorTasques
let tokenExpirationTime = null;  // Quan expira el token (timestamp)
let tokenRefreshInterval = null;  // Interval per refrescar el token


/* ------------------------------------------------------------
   PALETA MATERIAL YOU · COLORS VIUS (V4)
------------------------------------------------------------ */
/* const COLORS = [
    "#ff7961","#ff9e80","#ffcc80","#ffe57f","#ffff8d",
    "#ccff90","#b9f6ca","#80cbc4","#84ffff","#82b1ff",
    "#b388ff","#ea80fc","#ff80ab","#ff5252","#ff8a65",
    "#ffb74d","#ffd54f","#fff176","#aed581","#81c784",
    "#4db6ac","#4fc3f7","#64b5f6","#9575cd","#ba68c8",
    "#f06292","#e57373","#7986cb","#4fc3f7","#4dd0e1",
    "#4db6ac","#81c784"
]; */

const COLORS = [
    // Vermells
    "#E53935", "#F4511E",
    // Roses
    "#F06292",
    // Taronges
    "#FFA726",
    // Grocs
    "#D4E157", "#FFEE58",
    // Verdosos
    "#66BB6A", "#43A047",
    // Verds/Teals
    "#26A69A", "#00897B",
    // Turqueses / Blaus verdosos
    "#26C6DA", "#29B6F6", "#42A5F5",
    // Blaus
    "#5C6BC0", "#3949AB",
    // Liles / Morats
    "#7E57C2", "#AB47BC", "#8E24AA",
    // Neutres
    "#78909C", "#8D6E63", "#BDBDBD"
];



/* Color suau per al fons de targetes */
function soft(hex){
    const r=parseInt(hex.substr(1,2),16),
          g=parseInt(hex.substr(3,2),16),
          b=parseInt(hex.substr(5,2),16);
    return `rgba(${r},${g},${b},0.17)`;  // perfecte per Material You
}


/* ------------------------------------------------------------
   ESTAT GLOBAL
------------------------------------------------------------ */
let currentWorkspace = localStorage.getItem("appTitle") || "Gestor de Targetes";
const initialTitle = localStorage.getItem("appTitle") || "Gestor de Targetes";
const storedCards = localStorage.getItem(initialTitle);
//let cards = storedCards ? JSON.parse(storedCards) : [];
let cards = [];
const stored = localStorage.getItem(currentWorkspace);

if (stored) {
    try {
        cards = JSON.parse(stored);
    } catch {
        cards = [];
    }
} else {
    cards = [];
}

let activeFilters = [];
let selectedAddColor = localStorage.getItem("lastSelectedCardColor") || COLORS[0];
let editingIndex = null;

let lastSelectedCardColor = localStorage.getItem("lastSelectedCardColor") || COLORS[0];

let cardContainer = null;   // s’omplirà al DOMContentLoaded
let cardModal = null;       // modal fullscreen

function updateLastSelectedCardColorUI(color){
    const dot = document.getElementById("lastCardColorDot");
    const hex = document.getElementById("lastCardColorHex");
    if (!dot || !hex) return;

    dot.style.background = color;
    hex.textContent = color.toUpperCase();
}

function setLastSelectedCardColor(color){
    lastSelectedCardColor = color;
    localStorage.setItem("lastSelectedCardColor", color);
    updateLastSelectedCardColorUI(color);
}

function getNextColorInOrder(color){
    const index = COLORS.indexOf(color);
    if(index === -1) return COLORS[0];
    return COLORS[(index + 1) % COLORS.length];
}

function loadGapiClient() {
    // Ya no es necesario cargar gapi.client
    // Usamos la REST API directamente con fetch()
    console.log("Usando REST API de Google Drive");
}

async function waitForGapiClient() {
    while (typeof gapi === "undefined" || !gapi.client) {
        console.log("Esperant gapi...");
        await new Promise(r => setTimeout(r, 100));
    }
}



/* ------------------------------------------------------------
   GUARDAR A LOCALSTORAGE
------------------------------------------------------------ */
function save() {
    if (!currentWorkspace) {
        currentWorkspace = "Gestor de Targetes";
        localStorage.setItem("appTitle", currentWorkspace);
    }

    localStorage.setItem(currentWorkspace, JSON.stringify(cards));

    // Guarda també el nom del workspace actual
    localStorage.setItem("appTitle", currentWorkspace);

    // Sincronitza a Google Drive si està connectat (async, en background)
    if (driveReady) {
        saveWorkspaceToDrive(currentWorkspace).catch(err => console.error("Error guardant a Drive:", err));
    }
}

// Token refresh automàtic ELIMINAT
// Ara fem refresh reactiu quan detectem 401 (token expirat) en una request
// Això evita que es tanquin les targetes obertes sense motiu
/*
// Refrescar el token automàticament (cada 50 minuts)
async function startTokenRefresh() {
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
    }

    // Fer refresh cada 50 minuts (deixar 10 minuts de marge)
    tokenRefreshInterval = setInterval(async () => {
        console.log("🔄 Refrescant token de Google...");
        await performTokenRefresh();
    }, 50 * 60 * 1000); // 50 minuts
}
*/

// Helper: Check for expired token (401) i refrescar si és necessari
async function handleDriveResponse(response) {
    if (response.status === 401) {
        console.warn("⚠️ Token expirat (401). Intentant refrescar...");
        
        // Intentar refrescar el token
        await performTokenRefresh();
        
        // Esperar un moment per deixar que el popup refrescara el token
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Si el token segueix sent el mateix, mostrar avís
        if (googleAccessToken) {
            console.log("✅ Token refrescat. Reintentant operació...");
            return true; // Caller ha de reintentar la request
        } else {
            console.error("❌ No es va poder refrescar el token. Cal tornar a fer login.");
            showTokenExpiredAlert();
            return false;
        }
    }
    return null; // No hi ha problema
}

function showTokenExpiredAlert() {
    const message = "La teva sessió ha expirat. Fes login de nou.";
    console.warn(message);
    
    // Mostrar al·lerta visual (sense bloquejar)
    const banner = document.createElement('div');
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #f44336;
        color: white;
        padding: 12px;
        text-align: center;
        font-weight: 600;
        z-index: 9999;
        font-size: 14px;
    `;
    banner.textContent = `${message} `;
    
    const btn = document.createElement('button');
    btn.textContent = "Login";
    btn.style.cssText = `
        margin-left: 8px;
        background: white;
        color: #f44336;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
    `;
    btn.onclick = () => {
        handleGoogleLogin();
        banner.remove();
    };
    
    banner.appendChild(btn);
    document.body.insertBefore(banner, document.body.firstChild);
    
    setTimeout(() => {
        if (banner.parentNode) banner.remove();
    }, 8000);
}
async function performTokenRefresh() {
    if (!googleAccessToken) return;

    try {
        console.log("🔄 Refrescant token de Google...");
        
        const clientId = GOOGLE_CLIENT_ID;
        const pathWithoutFile = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        const redirectUri = window.location.origin + pathWithoutFile;
        const scope = GOOGLE_SCOPES;

        // Obrir popup invisible per auth
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${clientId}&` +
            `response_type=token&` +
            `scope=${encodeURIComponent(scope)}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `prompt=none`;

        const popup = window.open(authUrl, 'tokenRefresh', 'width=1,height=1');
        
        // Monitoritzar popup per token nou
        const checkInterval = setInterval(() => {
            try {
                // Intentar llegir URL del popup (si tenim accés)
                if (popup && popup.location && popup.location.hash) {
                    const hash = popup.location.hash.substring(1);
                    const params = new URLSearchParams(hash);
                    const newToken = params.get('access_token');
                    
                    if (newToken && newToken !== googleAccessToken) {
                        googleAccessToken = newToken;
                        localStorage.setItem("googleAccessToken", newToken);
                        console.log("✅ Token refrescat silenciosament!");
                        popup.close();
                        clearInterval(checkInterval);
                        return;
                    }
                }
            } catch (e) {
                // Si no podem accedir (popup blocker), tancar i continuar
                popup.close();
                clearInterval(checkInterval);
            }
        }, 500);

        // Timeout: tancar popup si no funciona
        setTimeout(() => {
            if (popup && !popup.closed) {
                popup.close();
            }
            clearInterval(checkInterval);
        }, 3000);

    } catch (err) {
        console.warn("⚠️ No es va poder refrescar el token silenciosament:", err);
        // Continue anyway - token serà vàlid uns minuts més
    }
}

// Ya no es necesario (refresh automático eliminado)
/*
function stopTokenRefresh() {
    if (tokenRefreshInterval) {
        clearInterval(tokenRefreshInterval);
        tokenRefreshInterval = null;
    }
}
*/


async function ensureAppFolder() {
    if (!googleAccessToken) {
        console.warn("⚠️ No hi ha token d'accés per crear carpeta");
        return;
    }

    try {
        console.log("🔍 Buscant carpeta OrganitzadorTasques...");
        
        // Buscar si ja existeix la carpeta
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='OrganitzadorTasques' and mimeType='application/vnd.google-apps.folder' and trashed=false&spaces=drive&fields=files(id)&pageSize=1`;
        
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        
        // Detectar si token expirat
        if (searchRes.status === 401) {
            const shouldRetry = await handleDriveResponse(searchRes);
            if (shouldRetry) {
                return await ensureAppFolder();
            }
            return;
        }
        
        if (!searchRes.ok) {
            throw new Error(`Error en cerca: ${searchRes.status} ${searchRes.statusText}`);
        }
        
        const searchData = await searchRes.json();

        if (searchData.files && searchData.files.length > 0) {
            // Carpeta ja existeix
            driveFolderId = searchData.files[0].id;
            localStorage.setItem("driveFolderId", driveFolderId);
            console.log("✅ Carpeta OrganitzadorTasques trobada:", driveFolderId);
            return;
        }

        console.log("📁 Carpeta no existeix. Creant-la...");
        
        // Crear carpeta nova
        const createUrl = `https://www.googleapis.com/drive/v3/files`;
        const folderMetadata = {
            name: 'OrganitzadorTasques',
            mimeType: 'application/vnd.google-apps.folder'
        };

        const createRes = await fetch(createUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${googleAccessToken}`
            },
            body: JSON.stringify(folderMetadata)
        });

        // Detectar si token expirat en create
        if (createRes.status === 401) {
            const shouldRetry = await handleDriveResponse(createRes);
            if (shouldRetry) {
                return await ensureAppFolder();
            }
            return;
        }

        if (!createRes.ok) {
            const errorText = await createRes.text();
            throw new Error(`Error creant carpeta: ${createRes.status} ${createRes.statusText} - ${errorText}`);
        }

        const folderData = await createRes.json();
        
        if (folderData.error) {
            throw new Error(`Error API: ${folderData.error.message}`);
        }
        
        driveFolderId = folderData.id;
        localStorage.setItem("driveFolderId", driveFolderId);
        console.log("✅ Carpeta OrganitzadorTasques creada:", driveFolderId);

    } catch (err) {
        console.error("❌ Error creant/buscant carpeta:", err);
        driveFolderId = null;
    }
}


async function saveWorkspaceToDrive(workspaceName) {
    if (!driveReady || !googleAccessToken) return;

    try {
        // Assegurar que hi ha driveFolderId (crear carpeta si no existeix)
        if (!driveFolderId) {
            console.log("ℹ️ Creant carpeta OrganitzadorTasques...");
            await ensureAppFolder();
            if (!driveFolderId) {
                console.warn("⚠️ No s'ha pogut crear/recuperar carpeta. Saltant sincronització.");
                return;
            }
        }

        const syncStatus = document.getElementById("syncStatus");
        if (syncStatus) {
            syncStatus.style.display = "inline-block";
            syncStatus.classList.add("syncing");
        }

        const fileName = `${workspaceName}.json`;
        const fileContent = JSON.stringify(cards);
        
        // Buscar si ja existeix el fitxer a la carpeta
        const query = `name='${fileName}' and trashed=false and mimeType='application/json'${driveFolderId ? ` and '${driveFolderId}' in parents` : ''}`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)&pageSize=1`;
        
        console.log("🔍 Buscant fitxer a Drive...");
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        
        // Detectar si el token ha expirat
        if (searchRes.status === 401) {
            const shouldRetry = await handleDriveResponse(searchRes);
            if (shouldRetry) {
                // Reintentam (recursió, però amb nou token)
                return await saveWorkspaceToDrive(workspaceName);
            }
            return;
        }
        
        if (!searchRes.ok) {
            throw new Error(`Error buscant fitxer: ${searchRes.status} ${searchRes.statusText}`);
        }
        
        const searchData = await searchRes.json();

        let fileId = null;
        if (searchData.files && searchData.files.length > 0) {
            fileId = searchData.files[0].id;
        }

        if (fileId) {
            // ACTUALITZAR fitxer existent
            console.log("📝 Actualitzant fitxer existent...");
            const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
            const updateRes = await fetch(updateUrl, {
                method: 'PATCH',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${googleAccessToken}`
                },
                body: fileContent
            });
            
            if (updateRes.status === 401) {
                const shouldRetry = await handleDriveResponse(updateRes);
                if (shouldRetry) {
                    return await saveWorkspaceToDrive(workspaceName);
                }
                return;
            }
            
            if (!updateRes.ok) {
                throw new Error(`Error actualitzant: ${updateRes.status} ${updateRes.statusText}`);
            }
            
            console.log(`✅ Workspace "${workspaceName}" actualitzat a Google Drive`);
        } else {
            // CREAR fitxer nou a la carpeta
            console.log("📄 Creant fitxer nou...");
            const metadata = {
                name: fileName,
                mimeType: 'application/json'
            };
            
            // Afegir a la carpeta si existeix
            if (driveFolderId) {
                metadata.parents = [driveFolderId];
                console.log("📁 Fitxer anirà a carpeta:", driveFolderId);
            }

            const createUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
            const boundary = '===============7330845974216740156==';
            const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${fileContent}\r\n--${boundary}--`;

            const createRes = await fetch(createUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                    'Authorization': `Bearer ${googleAccessToken}`
                },
                body: body
            });

            if (createRes.status === 401) {
                const shouldRetry = await handleDriveResponse(createRes);
                if (shouldRetry) {
                    return await saveWorkspaceToDrive(workspaceName);
                }
                return;
            }

            if (!createRes.ok) {
                const errorText = await createRes.text();
                throw new Error(`Error creant fitxer: ${createRes.status} ${createRes.statusText} - ${errorText}`);
            }

            const createData = await createRes.json();
            if (createData.id) {
                localStorage.setItem(workspaceName + "_driveId", createData.id);
                console.log(`✅ Workspace "${workspaceName}" creat a Google Drive (carpeta OrganitzadorTasques)`);
            } else if (createData.error) {
                throw new Error(`Error API Drive: ${createData.error.message}`);
            }
        }

        if (syncStatus) {
            syncStatus.classList.remove("syncing");
            setTimeout(() => {
                syncStatus.style.display = "none";
            }, 500);
        }

    } catch (err) {
        console.error("❌ Error sincronitzant a Google Drive:", err);
        const syncStatus = document.getElementById("syncStatus");
        if (syncStatus) {
            syncStatus.classList.remove("syncing");
            syncStatus.textContent = "✗";
            syncStatus.title = err.message;
            setTimeout(() => {
                syncStatus.style.display = "none";
                syncStatus.textContent = "✓";
            }, 2000);
        }
    }
}


/* ============================================================
   GOOGLE DRIVE SYNC — CARREGAR WORKSPACE (REST API)
============================================================ */

async function loadWorkspaceFromDrive(workspaceName) {
    if (!driveReady || !googleAccessToken) {
        console.log("⚠️ No hi ha autenticació. Saltant sincronització de Drive.");
        return null;
    }

    try {
        const fileName = `${workspaceName}.json`;
        
        // Buscar fitxer a la carpeta correcta
        const query = `name='${fileName}' and trashed=false and mimeType='application/json'${driveFolderId ? ` and '${driveFolderId}' in parents` : ''}`;
        const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id,modifiedTime)&pageSize=1`;
        
        console.log(`🔍 Buscant workspace "${workspaceName}" a Drive...`);
        const searchRes = await fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        
        // Detectar token expirat
        if (searchRes.status === 401) {
            const shouldRetry = await handleDriveResponse(searchRes);
            if (shouldRetry) {
                return await loadWorkspaceFromDrive(workspaceName);
            }
            return null;
        }
        
        if (!searchRes.ok) {
            throw new Error(`Error buscant fitxer: ${searchRes.status} ${searchRes.statusText}`);
        }
        
        const searchData = await searchRes.json();

        if (!searchData.files || searchData.files.length === 0) {
            console.log(`ℹ️ Workspace "${workspaceName}" no trobat a Drive (primera sincronització)`);
            return null;
        }

        const fileId = searchData.files[0].id;
        const driveModifiedTime = new Date(searchData.files[0].modifiedTime).getTime();

        // Comparar timestamps per detectar conflictes
        const localTimestamp = parseInt(localStorage.getItem(workspaceName + "_timestamp")) || 0;

        if (driveModifiedTime > localTimestamp) {
            // Drive és més recent, descarregar
            console.log(`📥 Descarregant workspace "${workspaceName}" de Drive...`);
            
            // Usar Authorization header en comptes de token a URL (evita CORS issues)
            const fileUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
            const fileRes = await fetch(fileUrl, {
                headers: {
                    'Authorization': `Bearer ${googleAccessToken}`
                }
            });
            
            if (fileRes.status === 401) {
                console.error("❌ Token expirat");
                googleAccessToken = null;
                driveReady = false;
                localStorage.removeItem("googleAccessToken");
                return null;
            }
            
            if (!fileRes.ok) {
                throw new Error(`Error descarregant fitxer: ${fileRes.status} ${fileRes.statusText}`);
            }
            
            const driveCards = await fileRes.json();

            // Guardar les dades del Drive a localStorage
            if (Array.isArray(driveCards)) {
                cards = driveCards;
                localStorage.setItem(currentWorkspace, JSON.stringify(cards));
                localStorage.setItem(workspaceName + "_timestamp", Date.now().toString());
                localStorage.setItem(workspaceName + "_driveId", fileId);

                console.log(`✅ ${cards.length} targetes carregades de Drive`);
                return driveCards;
            } else {
                console.warn("⚠️ Dades del Drive no són un array:", driveCards);
                return null;
            }
        } else {
            console.log(`ℹ️ Dades locals més recents que Drive. No sincronitzant.`);
            return null;
        }

    } catch (err) {
        console.error("❌ Error carregant des de Google Drive:", err);
        return null;
    }
}




/* ------------------------------------------------------------
   ID ÚNIC PER TARGETES (Render B ho necessita)
------------------------------------------------------------ */
function uid(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}


/* ------------------------------------------------------------
   LLISTES AUTOMÀTIQUES (* → •)
------------------------------------------------------------ */
function formatLists(text){
    return text.replace(/^ *\* +(.*)$/gm,"• $1");
}


/* ------------------------------------------------------------
   MODE FOSC (persistent)
------------------------------------------------------------ */
(function initTheme(){
    if(localStorage.getItem("theme")==="dark"){
        document.body.setAttribute("data-theme","dark");
    }
})();

function toggleTheme(){
    const dark = document.body.getAttribute("data-theme")==="dark";
    document.body.setAttribute("data-theme", dark ? "" : "dark");
    localStorage.setItem("theme", dark ? "light" : "dark");
}


/* ------------------------------------------------------------
   MENÚ ⚙ (obrir / tancar)
------------------------------------------------------------ */
function initExtraMenu(){
    const btn  = document.getElementById("extraMenuBtn");
    const menu = document.getElementById("extraMenu");

    btn.onclick = e=>{
        e.stopPropagation();
        menu.classList.toggle("hidden");
    };

    document.body.addEventListener("click",()=>{
        menu.classList.add("hidden");
    });
}


/* ------------------------------------------------------------
   HELPERS DOM — necessaris per Render B
------------------------------------------------------------ */

/* Crear un element HTML ràpidament */
function createEl(html){
    const div = document.createElement("div");
    div.innerHTML = html.trim();
    return div.firstElementChild;
}

/* SlideDown real */
function slideDown(el){
    el.style.maxHeight = "0px";
    el.style.display = "block";

    const h = el.scrollHeight;
    requestAnimationFrame(()=>{
        el.style.transition = "max-height .35s ease, padding .30s ease";
        el.style.maxHeight = h + "px";
    });
}

/* SlideUp real */
function slideUp(el){
    el.style.maxHeight = el.scrollHeight + "px";
    requestAnimationFrame(()=>{
        el.style.transition = "max-height .3s ease, padding .25s ease";
        el.style.maxHeight = "0px";
    });
}

/* Fade-out + remove */
function fadeOutRemove(el, cb){
    el.style.transition = "opacity .25s ease";
    el.style.opacity = "0";
    setTimeout(()=>{
        el.remove();
        if(cb) cb();
    },250);
}

/* Recalcular altura del body quan la paleta canvia */
function recalcCardBodyHeight(el){
    const body = el.querySelector(".cardBody");
    if(!body.classList.contains("open")) return;

    body.style.maxHeight = "none";
    const h = body.scrollHeight;
    body.style.maxHeight = h + "px";
}


/* ------------------------------------------------------------
   DOM READY
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded",()=>{
    cardContainer = document.getElementById("cardContainer");
    cardModal     = document.getElementById("cardModal");

    initExtraMenu();
});

/* ============================================================
   JS V4 — PART 2
   Formulari, suggeriments, paleta, llistes, crear targeta,
   i botó Obrir/Tancar totes.
============================================================ */


/* ---------- ELEMENTS FORMULARI ---------- */

const addPanel            = document.getElementById("addPanel");
const addBtn              = document.getElementById("addBtn");
const closeAdd            = document.getElementById("closeAdd");

const newTitle            = document.getElementById("newTitle");
const newTags             = document.getElementById("newTags");
const newContent          = document.getElementById("newContent");

const tagSuggestions      = document.getElementById("tagSuggestions");
const tagAutocomplete     = document.getElementById("tagAutocomplete");

const addColorSelector    = document.getElementById("addColorSelector");
const selectedAddColorEl  = document.getElementById("selectedAddColor");
const addColorPalette     = document.getElementById("addColorPalette");

const toggleAllBtn        = document.getElementById("toggleAllBtn");
const clearFiltersBtn     = document.getElementById("clearFilters");


/* ============================================================
   OBRIR / TANCAR FORMULARI
============================================================ */

addBtn.onclick = () => {
    selectedAddColor = getNextColorInOrder(lastSelectedCardColor);
    selectedAddColorEl.style.background = selectedAddColor;
    renderAddPalette();
    addColorPalette.classList.remove("hidden");
    addPanel.classList.remove("hidden");
};
closeAdd.onclick = () => {
    addPanel.classList.add("hidden");
    tagAutocomplete.classList.add("hidden");
};


/* ============================================================
   PALETA DE COLORS (FORMULARI)
============================================================ */

function renderAddPalette(){
    addColorPalette.innerHTML = "";

    COLORS.forEach(c => {
        const dot = createEl(`<div class="colorDot"></div>`);
        dot.style.background = c;

        if(c === selectedAddColor) dot.classList.add("active");

        dot.onclick = () => {
            selectedAddColor = c;
            selectedAddColorEl.style.background = c;
        };

        addColorPalette.appendChild(dot);
    });
}
renderAddPalette();

addColorSelector.onclick = () => {
    addColorPalette.classList.remove("hidden");
};


/* ============================================================
   SUGGERIMENTS D’ETIQUETES (CHIPS)
============================================================ */

function buildTagSuggestions(){
    tagSuggestions.innerHTML = "";
    const tagSuggestionCollator = new Intl.Collator("ca", { sensitivity: "base", numeric: true });

    const set = new Set();
    cards.forEach(card => card.tags.forEach(t => set.add(t)));

    if(set.size === 0){
        tagSuggestions.classList.add("hidden");
        return;
    }

    const sortedSuggestions = [...set].sort((a, b) => tagSuggestionCollator.compare(a, b));

    sortedSuggestions.forEach(tag => {
        const chip = createEl(`<div class="suggestionChip">${tag}</div>`);
        chip.onclick = () => addTagToInput(tag);
        tagSuggestions.appendChild(chip);
    });

    tagSuggestions.classList.remove("hidden");
}
buildTagSuggestions();


function addTagToInput(tag){
    let arr = newTags.value.split(",").map(t=>t.trim()).filter(Boolean);
    if(!arr.includes(tag)){
        arr.push(tag);
        newTags.value = arr.join(", ");
    }
    tagAutocomplete.classList.add("hidden");
}


/* ============================================================
   AUTOCOMPLETE D’ETIQUETES
============================================================ */

newTags.addEventListener("input", ()=>{

    const txt = newTags.value.toLowerCase().trim();
    const tagSuggestionCollator = new Intl.Collator("ca", { sensitivity: "base", numeric: true });
    tagAutocomplete.innerHTML = "";

    if(!txt){
        tagAutocomplete.classList.add("hidden");
        return;
    }

    const set = new Set();
    cards.forEach(card => card.tags.forEach(t => set.add(t)));

    const matches = [...set]
        .filter(t => t.toLowerCase().includes(txt))
        .sort((a, b) => tagSuggestionCollator.compare(a, b));
    if(matches.length === 0){
        tagAutocomplete.classList.add("hidden");
        return;
    }

    matches.forEach(tag => {
        const item = createEl(`<div class="autocompleteItem">${tag}</div>`);
        item.onclick = () => addTagToInput(tag);
        tagAutocomplete.appendChild(item);
    });

    tagAutocomplete.classList.remove("hidden");
});


/* ============================================================
   LLISTES AUTOMÀTIQUES ( * → • )
============================================================ */

newContent.addEventListener("input", () => {
    const pos = newContent.selectionStart;
    newContent.value = formatLists(newContent.value);
    newContent.selectionEnd = pos;
});


/* ============================================================
   CREAR TARGETA (Render B, DOM-only)
============================================================ */

createCardBtn.onclick = () => {

    const title = newTitle.value.trim();
    if(!title){
        alert("Cal un títol!");
        return;
    }

    const tags = newTags.value
        .split(",")
        .map(t=>t.trim())
        .filter(Boolean);

    const content = formatLists(newContent.value.trim());

    const card = {
        id: uid(),
        title,
        tags,
        content,
        color: selectedAddColor,
        open: false,
        pinned: false
    };

    cards.unshift(card);
    save();

    newTitle.value = "";
    newTags.value = "";
    newContent.value = "";
    addPanel.classList.add("hidden");

    buildTagSuggestions();

    insertNewCardDOM(card);
    applySearchAndFilterToDOM();
};


/* Inserir targeta nova amb animació */
function insertNewCardDOM(card){
    const el = buildCardElement(card);

    el.classList.add("entering");
    cardContainer.prepend(el);

    requestAnimationFrame(()=>{
        el.classList.add("show");
    });
}


/* ============================================================
   BOTÓ OBRIR/TANCAR TOTES LES TARGETES
============================================================ */

let allOpen = false;  // estat del toggle

toggleAllBtn.onclick = () => {

    allOpen = !allOpen;

    toggleAllBtn.textContent = allOpen ? "▸ Tancar totes" : "▾ Obrir totes";

    [...cardContainer.children].forEach(el => {
        const id = el.dataset.id;
        const card = cards.find(c => c.id === id);
        if(!card) return;

        if(allOpen && !card.open){
            card.open = true;
            save();
            openCardDOM(el);
        }
        else if(!allOpen && card.open){
            card.open = false;
            save();
            saveInline();
            closeCardDOM(el);
        }
    });
};


/* Obrir targeta per toggle */
function openCardDOM(el){
    const body = el.querySelector(".cardBody");
    const compact = el.querySelector(".tagRowCompact");

    compact.style.display = "none";

    // ESTAT OBERT
    body.classList.add("open");
    el.classList.add("openCard");

    // padding correcte
    body.style.padding = "16px 14px 20px 14px";

    // recalcular abans del slideDown
    body.style.maxHeight = "none";
    const h = body.scrollHeight + "px";
    body.style.maxHeight = "0px";

    requestAnimationFrame(()=>{
        body.style.transition = "max-height .35s ease, padding .3s ease";
        body.style.maxHeight = h;
    });
}


/* Tancar targeta per toggle */
function closeCardDOM(el){
    const body = el.querySelector(".cardBody");
    const compact = el.querySelector(".tagRowCompact");

    compact.style.display = "flex";

    body.classList.remove("open");
    el.classList.remove("openCard");

    body.style.maxHeight = body.scrollHeight + "px";

    requestAnimationFrame(()=>{
        body.style.transition = "max-height .3s ease, padding .25s ease";
        body.style.maxHeight = "0px";
        body.style.padding = "0 14px"; // padding tancat
    });
}


/* ============================================================
   JS V4 — PART 3
   Targetes (Render B), Glow, editar inline, pin, eliminar,
   canvi de color, recalcular alçada
============================================================ */


/* ============================================================
   CONSTRUIR TARGETA (Render B — sense re-render global)
============================================================ */
function buildCardElement(card) {

    const softBg = soft(card.color);

    const el = createEl(`
        <div class="card" data-id="${card.id}">
            <div class="cardColorBar" draggable="true"></div>

            <div class="cardHeader" draggable="true">
                <div class="cardHeaderLeft">
                    <span class="cardTitle"></span>
                    <div class="tagRowCompact"></div>
                </div>
				<div class="btnRow">
					<button class="iconBtn pinBtn"></button>
                    <button class="iconBtn editBtn">${ICON_EDIT}</button>
                    <button class="iconBtn deleteBtn">${ICON_DELETE}</button>
                    <button class="iconBtn colorBtn">${ICON_COLOR}</button>
					<button class="iconBtn modalBtn">${ICON_MODAL}</button>
				</div>
				<div class="palette hidden"></div>
            </div>

            <div class="cardBody">
                <div class="bodyText bodyTextEdit" contenteditable="true"></div>
            </div>
        </div>
    `);

    const colorBar   = el.querySelector(".cardColorBar");
    const header     = el.querySelector(".cardHeader");
    const titleEl    = el.querySelector(".cardTitle");
    const rowCompact = el.querySelector(".tagRowCompact");
    const body       = el.querySelector(".cardBody");
    const bodyText   = el.querySelector(".bodyText");
    const pinBtn     = el.querySelector(".pinBtn");
    const editBtn    = el.querySelector(".editBtn");
    const deleteBtn  = el.querySelector(".deleteBtn");
    const colorBtn   = el.querySelector(".colorBtn");
    const palette    = el.querySelector(".palette");
	const modalBtn = el.querySelector(".modalBtn");

    /* -------- COLORS -------- */
    colorBar.style.background = card.color;
    header.style.background = softBg;
    body.style.background   = softBg;
	el.style.background = softBg;

    /* -------- TÍTOL I TEXT -------- */
    // TÍTOL EDITABLE
    titleEl.textContent = card.title;

    // COS EDITABLE
    bodyText.innerHTML = card.content.replace(/\n/g,"<br>");
    bodyText.setAttribute("contenteditable", "true");


    /* -------- ETIQUETES COMPACTES -------- */
    rowCompact.innerHTML = "";

    card.tags.forEach(t => {
        rowCompact.appendChild(createEl(`<span class="tagCompact">${t}</span>`));
    });

    /* -------- PIN -------- */
    pinBtn.textContent = card.pinned ? ICON_PIN : ICON_UNPIN;
    pinBtn.onclick = e=>{
        e.stopPropagation();
        togglePinDOM(card, el);
    };

    /* -------- EDITAR INLINE -------- */
    editBtn.onclick = e=>{
        e.stopPropagation();
        startEditDOM(card, el);
    };

    /* -------- ELIMINAR -------- */
    deleteBtn.onclick = e=>{
        e.stopPropagation();
        deleteCardDOM(card, el);
    };

    /* -------- CANVI DE COLOR -------- */
    colorBtn.onclick = e=>{
        e.stopPropagation();
        toggleColorPaletteDOM(card, el);
    };
	
	/* -------- OBRIR MODAL -------- */
	modalBtn.onclick = e => {
		e.stopPropagation();
		openModalForCard(card, el);
	};

    /* -------- OBRIR/TANCAR AMB ANIMACIÓ -------- */
    header.addEventListener("click", e => {
        // no toggle mentre edites
        if (bodyText.matches(":focus") || rowCompact.matches(":focus")) {
            e.stopPropagation();
            return;
        }

        // no toggle si fas click a botons
        if (e.target.closest(".iconBtn")) {
            e.stopPropagation();
            return;
        }

        toggleCardDOM(card, el);
    });


    /* -------- ESTAT INICIAL -------- */
    if(card.open){
        el.classList.add("openCard");
        body.classList.add("open");
        body.style.maxHeight = body.scrollHeight + "px";
        el.style.setProperty("--glow-color", soft(card.color));
    }

    enableInlineAutoSave(card, el);

    return el;
}


/* ============================================================
   OBRIR/TANCAR TARGETA — Glow + gradient (Opció C)
============================================================ */
function toggleCardDOM(card, el){
    const body = el.querySelector(".cardBody");
    const compact = el.querySelector(".tagRowCompact");

    card.open = !card.open;
    save();

    if(card.open){
        //compact.style.display = "none";
        el.classList.add("openCard");
        el.style.setProperty("--glow-color", soft(card.color));
		body.style.padding = "16px 14px 20px 14px";
        slideDown(body);
    } else {
        compact.style.display = "flex";
        el.classList.remove("openCard");
		body.style.padding = "0 14px";
        slideUp(body);
        // neteja segura (només quan tanco)
        const safe = formatLists(card.content).replace(/\n/g,"<br>");
        body.querySelector(".bodyText").innerHTML = safe;
    }
}


/* ============================================================
   CANVI DE COLOR (Render B - sense re-render global)
============================================================ */

function toggleColorPaletteDOM(card, el){
    const pal = el.querySelector(".palette");
    pal.classList.toggle("hidden");

    if(!pal.dataset.loaded){
        pal.innerHTML="";
        COLORS.forEach(c=>{
            const dot = createEl(`<div class="colorDot"></div>`);
            dot.style.background = c;
            if(c === card.color) dot.classList.add("active");

            dot.onclick = e=>{
                e.stopPropagation();
                card.color = c;
                setLastSelectedCardColor(c);
                save();
                applyColorDOM(card, el);
            };

            pal.appendChild(dot);
        });
        pal.dataset.loaded="1";
    }

    /* Ajustem alçada del body quan la paleta creix */
    recalcCardBodyHeight(el);
}

/* Aplicar color immediat al DOM */
function applyColorDOM(card, el){
    const softBg = soft(card.color);

    el.querySelector(".cardColorBar").style.background = card.color;
    el.querySelector(".cardHeader").style.background = softBg;
    el.querySelector(".cardBody").style.background   = softBg;
	el.style.background = softBg;

    el.style.setProperty("--glow-color", soft(card.color)); // glow actualitzat

    /* Actualitzar dots actius */
    el.querySelectorAll(".palette .colorDot")
        .forEach(d=> d.classList.toggle("active", d.style.background===card.color));
}


/* ============================================================
   PIN — Reordenació DOM-only
============================================================ */
function togglePinDOM(card, el){
    card.pinned = !card.pinned;
    save();

    el.querySelector(".pinBtn").textContent = card.pinned ? ICON_PIN : ICON_UNPIN;

    const children = [...cardContainer.children];

    const pinned = children.filter(n =>{
        const c = cards.find(x=>x.id === n.dataset.id);
        return c.pinned;
    });

    const others = children.filter(n =>{
        const c = cards.find(x=>x.id === n.dataset.id);
        return !c.pinned;
    });

    cardContainer.innerHTML="";
    [...pinned,...others].forEach(n => cardContainer.appendChild(n));
	
	cards.sort((a,b) => Number(b.pinned) - Number(a.pinned));
	save();
}


/* ============================================================
   ELIMINAR TARGETA — Fade-out + DOM-only
============================================================ */
function deleteCardDOM(card, el){
    if(!confirm("Vols eliminar aquesta targeta?")) return;

    cards = cards.filter(c => c.id !== card.id);
    save();

    fadeOutRemove(el, ()=> applySearchAndFilterToDOM());
}


/* ============================================================
   EDITAR INLINE — Sense re-render global
============================================================ */

function startEditDOM(card, el){
    const body = el.querySelector(".cardBody");

    body.innerHTML = `
        <label>Títol</label>
        <input class="editField" id="editTitle" value="${card.title}">

        <label>Etiquetes</label>
        <input class="editField" id="editTags" value="${card.tags.join(", ")}">

        <div class="btnRow">
            <button class="iconBtn saveBtn">✔</button>
            <button class="iconBtn cancelBtn">✖</button>
        </div>
    `;

    body.classList.add("open");
    body.style.maxHeight = body.scrollHeight + "px";

    el.classList.add("openCard");

    body.querySelector(".saveBtn").onclick = ()=>{
        card.title = document.getElementById("editTitle").value.trim();
        card.tags = document.getElementById("editTags").value
            .split(",")
            .map(t=>t.trim())
            .filter(Boolean);

        card.content = formatLists(document.getElementById("editContent").value.trim());

        save();
        replaceCardDOM(card, el);
        applySearchAndFilterToDOM();
    };

    body.querySelector(".cancelBtn").onclick = ()=>{
        replaceCardDOM(card, el);
    };
}


/* Substituir la targeta editada sense re-render global */
function replaceCardDOM(card, oldEl){
    const newEl = buildCardElement(card);
    oldEl.replaceWith(newEl);
}


/* ============================================================
   BUILD INICIAL
============================================================ */
function initCards(){
    cardContainer.innerHTML="";
    cards.forEach(card =>{
        const el = buildCardElement(card);
        cardContainer.appendChild(el);
    });
}

/* ============================================================
   JS V4 — PART 4
   MODAL FULLSCREEN · CERCA FINAL · FILTRES · DRAG&DROP INIT
============================================================ */


/* ------------------------------------------------------------
   MODAL ELEMENTS
------------------------------------------------------------ */
const modalBackdrop   = document.getElementById("modalBackdrop");
const modalContentEl  = document.getElementById("modalContent");
const modalTitleDisp  = document.getElementById("modalTitleDisplay");
const modalTitleInput = document.getElementById("modalTitle");
const modalTagsInput  = document.getElementById("modalTags");
const modalTextInput  = document.getElementById("modalText");
const modalClose      = document.getElementById("modalClose");
const modalSave       = document.getElementById("modalSave");

const modalColorSelector = document.getElementById("modalColorSelector");
const modalColorDot      = document.getElementById("modalColorDot");
const modalColorPalette  = document.getElementById("modalColorPalette");

let modalCurrentCard = null;


/* ============================================================
   OBRIR MODAL D’UNA TARGETA
============================================================ */

function openModalForCard(card, cardEl){

    modalCurrentCard = card;

    // Posem contingut
    modalTitleDisp.textContent = card.title;
    modalTagsInput.value = card.tags.join(", ");
    modalTextInput.value = card.content;
    modalColorDot.style.background = card.color;

    // Mostrem modal
    cardModal.classList.remove("hidden");

    // Afegim glow color inline
    modalContentEl.style.setProperty("--glow-color", soft(card.color));

    // Paleta modal
    renderModalColorPalette();

    // Focus al títol
    setTimeout(()=>modalTextInput.focus(), 50);
}


/* ============================================================
   TANCAR MODAL
============================================================ */

function closeModal(){
    cardModal.classList.add("hidden");
    modalCurrentCard = null;
}

modalClose.onclick = closeModal;
modalBackdrop.onclick = closeModal;


/* ============================================================
   MODAL — CANVI DE COLOR
============================================================ */

function renderModalColorPalette(){
    modalColorPalette.innerHTML = "";

    COLORS.forEach(c=>{
        const dot = createEl(`<div class="colorDot"></div>`);
        dot.style.background = c;
        if(c === modalCurrentCard.color) dot.classList.add("active");

        dot.onclick = ()=>{
            modalCurrentCard.color = c;
            setLastSelectedCardColor(c);
            modalColorDot.style.background = c;
            modalContentEl.style.setProperty("--glow-color", soft(c));
            save();

            // Actualitzar DOM immediat
            const cardEl = [...cardContainer.children].find(x=>x.dataset.id === modalCurrentCard.id);
            if(cardEl) applyColorDOM(modalCurrentCard, cardEl);
        };

        modalColorPalette.appendChild(dot);
    });
}

modalColorSelector.onclick = ()=>{
    modalColorPalette.classList.toggle("hidden");
};


/* ============================================================
   MODAL — LLISTES AUTOMÀTIQUES
============================================================ */

modalTextInput.addEventListener("input", ()=>{
    const pos = modalTextInput.selectionStart;
    modalTextInput.value = formatLists(modalTextInput.value);
    modalTextInput.selectionEnd = pos;
});


/* ============================================================
   MODAL — GUARDAR CANVIS
============================================================ */

modalSave.onclick = ()=>{

    if(!modalCurrentCard) return;

    modalCurrentCard.title = modalTitleDisp.textContent.trim() || modalCurrentCard.title;
    modalCurrentCard.tags  = modalTagsInput.value
                                .split(",")
                                .map(t=>t.trim())
                                .filter(Boolean);
    modalCurrentCard.content = formatLists(modalTextInput.value.trim());

    save();

    // Actualitzar DOM de la targeta
    const cardEl = [...cardContainer.children].find(x=>x.dataset.id === modalCurrentCard.id);
    if(cardEl) replaceCardDOM(modalCurrentCard, cardEl);

    buildTagSuggestions();
    applySearchAndFilterToDOM();
    closeModal();
};


/* ============================================================
   CERCA DOM-ONLY (versió final)
============================================================ */

/* document.getElementById("search")
    .addEventListener("input", applySearchAndFilterToDOM); */

function applySearchAndFilterToDOM() {

    const s = searchInput.value.toLowerCase().trim();

    [...cardContainer.children]
        .filter(el => el.classList.contains("card"))
        .forEach(el => {
            const card = cards.find(c => c.id === el.dataset.id);

            let visible = true;

            // CERCA
            if (s) {
                const inTitle = card.title.toLowerCase().includes(s);
                const inText  = card.content.toLowerCase().includes(s);
                const inTags  = card.tags.some(t => t.toLowerCase().includes(s));
                if (!inTitle && !inText && !inTags) visible = false;
            }

            // FILTRE OR
            if (visible && activeFilters.length) {
                const match = card.tags.some(t => activeFilters.includes(t));
                if (!match) visible = false;
            }

            el.style.display = visible ? "block" : "none";
        });
}



/* ============================================================
   FILTRES D’ETIQUETES (OR)
============================================================ */

const tagFilterContainer = document.getElementById("tagFilterContainer");
const filterTagCollator = new Intl.Collator('ca', { sensitivity: 'base', numeric: true });
const expandedFilterGroups = new Set();

function splitFilterGroupTag(tag){
    const i = tag.indexOf("-");
    if(i <= 0) return null;

    const prefix = tag.slice(0, i).trim();
    const suffix = tag.slice(i + 1).trim();
    if(!prefix || !suffix) return null;

    return { prefix, suffix };
}

function toggleTagFilter(tag){
    if (activeFilters.includes(tag))
        activeFilters = activeFilters.filter(t => t !== tag);
    else
        activeFilters.push(tag);

    rebuildFilters();
    applySearchAndFilterToDOM();
}

function rebuildFilters(){
    tagFilterContainer.innerHTML = "";

    const set = new Set();
    cards.forEach(c => c.tags.forEach(t => set.add(t)));

    const standaloneTags = [];
    const groupedTags = new Map();

    [...set].forEach(tag => {
        const groupInfo = splitFilterGroupTag(tag);
        if(!groupInfo){
            standaloneTags.push(tag);
            return;
        }

        if(!groupedTags.has(groupInfo.prefix)){
            groupedTags.set(groupInfo.prefix, []);
        }
        groupedTags.get(groupInfo.prefix).push(tag);
    });

    standaloneTags.sort((a, b) => filterTagCollator.compare(a, b));
    groupedTags.forEach(tags => tags.sort((a, b) => filterTagCollator.compare(a, b)));

    // Neteja grups oberts que ja no existeixen
    [...expandedFilterGroups].forEach(prefix => {
        if(!groupedTags.has(prefix)) expandedFilterGroups.delete(prefix);
    });

    const groupedPrefixes = [...groupedTags.keys()]
        .filter(prefix => groupedTags.get(prefix).length > 1)
        .sort((a, b) => filterTagCollator.compare(a, b));

    const singleGroupedTags = [...groupedTags.entries()]
        .filter(([, tags]) => tags.length === 1)
        .map(([, tags]) => tags[0]);

    const entryList = [
        ...standaloneTags.map(tag => ({ type: "tag", value: tag })),
        ...singleGroupedTags.map(tag => ({ type: "tag", value: tag })),
        ...groupedPrefixes.map(prefix => ({ type: "group", value: prefix }))
    ].sort((a, b) => filterTagCollator.compare(a.value, b.value));

    const expandedRows = [];

    entryList.forEach(entry => {
        if(entry.type === "tag"){
            const tag = entry.value;
            const chip = createEl(`<div class="tagFilterChip">${tag}</div>`);

            if (activeFilters.includes(tag)) chip.classList.add("active");

            chip.onclick = ()=> toggleTagFilter(tag);

            tagFilterContainer.appendChild(chip);
            return;
        }

        const prefix = entry.value;
        const tags = groupedTags.get(prefix) || [];
        const isExpanded = expandedFilterGroups.has(prefix);
        const hasActiveChild = tags.some(tag => activeFilters.includes(tag));
        const arrow = isExpanded ? "▾" : "▸";
        const groupChip = createEl(`<div class="tagFilterChip tagFilterGroupChip">${arrow} ${prefix}</div>`);

        if (hasActiveChild) groupChip.classList.add("active");

        groupChip.onclick = ()=>{
            if(isExpanded) expandedFilterGroups.delete(prefix);
            else expandedFilterGroups.add(prefix);
            rebuildFilters();
        };

        tagFilterContainer.appendChild(groupChip);

        if(isExpanded){
            const childrenRow = createEl('<div class="tagFilterChildrenRow"></div>');
            tags.forEach(tag => {
                const childChip = createEl(`<div class="tagFilterChip tagFilterChildChip">${tag}</div>`);

                if (activeFilters.includes(tag)) childChip.classList.add("active");

                childChip.onclick = ()=> toggleTagFilter(tag);

                childrenRow.appendChild(childChip);
            });
            expandedRows.push(childrenRow);
        }
    });

    expandedRows.forEach(row => tagFilterContainer.appendChild(row));
}


function exportCards(){
    const data = JSON.stringify(cards, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "targetes.json";
    a.click();

    URL.revokeObjectURL(url);
}

function startInlineEdit(card, el){
    const bodyText = el.querySelector(".bodyText");
    const editBtn  = el.querySelector(".editBtn");
    const saveBtn  = el.querySelector(".saveInline");
    const cancelBtn = el.querySelector(".cancelInline");

    bodyText.setAttribute("contenteditable", "true");
    bodyText.classList.add("bodyTextEdit");

    // Mostrar botons de guardar/cancel·lar
    saveBtn.classList.remove("hidden");
    cancelBtn.classList.remove("hidden");
    editBtn.classList.add("hidden");

    // Guardem el contingut original temporalment
    bodyText.dataset.original = bodyText.innerHTML.trim();
}

function saveInlineEdit(card, el){
    const bodyText = el.querySelector(".bodyText");
    const saveBtn  = el.querySelector(".saveInline");
    const cancelBtn = el.querySelector(".cancelInline");
    const editBtn  = el.querySelector(".editBtn");

    // Actualitzar el contingut del card
    card.content = formatLists(bodyText.innerText.trim());
    save();

    // Tornar al mode normal
    bodyText.removeAttribute("contenteditable");
    bodyText.classList.remove("bodyTextEdit");
    bodyText.innerHTML = card.content.replace(/\n/g,"<br>");

    saveBtn.classList.add("hidden");
    cancelBtn.classList.add("hidden");
    editBtn.classList.remove("hidden");
}

function cancelInlineEdit(el){
    const bodyText = el.querySelector(".bodyText");
    const saveBtn  = el.querySelector(".saveInline");
    const cancelBtn = el.querySelector(".cancelInline");
    const editBtn  = el.querySelector(".editBtn");

    // Restaurar text original
    bodyText.innerHTML = bodyText.dataset.original;

    // Tornar al mode normal
    bodyText.removeAttribute("contenteditable");
    bodyText.classList.remove("bodyTextEdit");

    saveBtn.classList.add("hidden");
    cancelBtn.classList.add("hidden");
    editBtn.classList.remove("hidden");
}

let autosaveTimer = null;

function enableInlineAutoSave(card, el){
    const body = el.querySelector(".bodyText");
    const cardBody = el.querySelector(".cardBody");

    let autosaveTimer = null;

    body.oninput = e => {

        richTextAutoList(e, body, card, el);

        // 1. Treure animació perquè no distorsioni el recalcul
        cardBody.style.transition = "none";

        // 2. Deixar que creixi naturalment
        cardBody.style.maxHeight = "none";

        // 3. Recalc en el següent frame (precís i sense saltar)
        requestAnimationFrame(() => {
            const h = cardBody.scrollHeight + "px";
            cardBody.style.maxHeight = h;
        });

        // 4. Guardar automàtic
        if (autosaveTimer) clearTimeout(autosaveTimer);
        autosaveTimer = setTimeout(() => saveInline(card, el, false), 400);
    };

    body.onblur = () => {
        // Restaurar animació després d'editar
        cardBody.style.transition = "";
        saveInline(card, el, false);
    };
}




function saveInline(card, el, normalize = true){
    if (!el) return;
    const body = el.querySelector(".bodyText");
    if (!body) return;

    // Actualitza només el model
    card.content = body.innerHTML.trim();
    save();

    // Si normalize és false → NO modifiquem HTML
    if (!normalize) return;

    // Quan tanques targeta → netegem HTML
    const safe = card.content
        .replace(/<div>/g,"<br>")
        .replace(/<\/div>/g,"")
        .replace(/<br><br>/g,"<br>");

    body.innerHTML = safe;
}


function extractTagsFromEditable(el){
    return el.innerText
             .split(/[\s,]+/)
             .map(t => t.trim())
             .filter(t => t.length > 0);
}

// Obtindre la selecció dins d'un contenteditable
function saveSelection(containerEl) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(containerEl);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;

    return {
        start: start,
        end: start + range.toString().length
    };
}

function restoreSelection(containerEl, savedSel) {
    if (!savedSel) return;

    let charIndex = 0, range = document.createRange();
    range.setStart(containerEl, 0);
    range.collapse(true);

    const nodeStack = [containerEl];
    let node, foundStart = false, stop = false;

    while (!stop && (node = nodeStack.pop())) {
        if (node.nodeType === 3) {
            const nextCharIndex = charIndex + node.length;
            if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
                range.setStart(node, savedSel.start - charIndex);
                foundStart = true;
            }
            if (foundStart && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                range.setEnd(node, savedSel.end - charIndex);
                stop = true;
            }
            charIndex = nextCharIndex;
        } else {
            let i = node.childNodes.length;
            while (i--) nodeStack.push(node.childNodes[i]);
        }
    }

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function richTextAutoList(e, body, card, el) {
    const text = body.innerText;

    // * + espai
    if (text.endsWith("* ")) {
        document.execCommand("insertUnorderedList");
        return;
    }

    // - + espai
    if (text.endsWith("- ")) {
        document.execCommand("insertUnorderedList");
        return;
    }

    // 1. + espai
    if (text.match(/^\d+\. $/)) {
        document.execCommand("insertOrderedList");
        return;
    }

    // --- + Enter → línia divisòria
    if (e.key === "Enter" && text.endsWith("---")) {
        e.preventDefault();
        document.execCommand("insertHorizontalRule");
        return;
    }
}

function getAllWorkspaces() {
    const keys = Object.keys(localStorage);
    return keys.filter(k => {
        // Excloure variables de sistema i metadades
        const exclusions = [
            "appTitle",
            "cardColumns",
            "theme",
            "googleAccessToken",
            "driveFolderId",
            "tokenExpirationTime"
        ];
        
        if (exclusions.includes(k)) return false;
        
        // Excloure metadades de workspaces (timestamps, IDs, etc)
        if (k.endsWith("_timestamp") || 
            k.endsWith("_driveId") || 
            k.endsWith("_driveMtime") ||
            k.endsWith("_timestamp")) {
            return false;
        }
        
        return true;
    });
}

function buildWorkspaceDropdown() {
    workspaceDropdown.innerHTML = "";

    const list = getAllWorkspaces();

    list.forEach(name => {
        const item = document.createElement("div");
        item.className = "workspaceItem";

        const left = document.createElement("span");
        left.textContent = name;

        const del = document.createElement("button");
        del.textContent = "🗑";
        del.className = "workspaceDeleteBtn";
        del.onclick = (e) => {
            e.stopPropagation();
            deleteWorkspace(name);
            buildWorkspaceDropdown();
        };

        item.appendChild(left);
        item.appendChild(del);

        item.onclick = () => {
            loadWorkspace(name);
            workspaceDropdown.classList.add("hidden");
        };

        workspaceDropdown.appendChild(item);
    });

    const newItem = document.createElement("div");
    newItem.className = "workspaceItem";
    newItem.textContent = "[ + ]";
    newItem.onclick = () => {
        createNewWorkspace();
        workspaceDropdown.classList.add("hidden");
    };
    workspaceDropdown.appendChild(newItem);

}


function loadWorkspace(name) {
    const stored = localStorage.getItem(name);

    if (stored) {
        cards = JSON.parse(stored);
    } else {
        cards = [];
    }

    currentWorkspace = name;
    localStorage.setItem("appTitle", currentWorkspace);

    appTitle.innerText = name;

    initCards();
    rebuildFilters();
    applySearchAndFilterToDOM();
}

function createNewWorkspace() {

    let name = prompt("Nom del nou document:");

    if (!name || name.trim() === "") {
        alert("Has d'introduir un nom vàlid.");
        return;
    }

    name = name.trim();

    if (localStorage.getItem(name)) {
        alert("Ja existeix un document amb aquest nom.");
        return;
    }

    // Crear workspace nou
    currentWorkspace = name;
    localStorage.setItem("appTitle", currentWorkspace);

    cards = [];
    save();

    // Actualitzar el títol visible
    document.getElementById("appTitle").innerText = currentWorkspace;

    initCards();
    rebuildFilters();
    applySearchAndFilterToDOM();
}

function deleteWorkspace(name) {

    if (name === currentWorkspace) {
        alert("No pots eliminar el document que tens obert. Obre un altre document abans.");
        return;
    }

    if (!confirm(`Segur que vols eliminar "${name}"?\nAixò esborrarà totes les targetes d'aquest document.`)) {
        return;w99 
    }

    localStorage.removeItem(name);
}

async function initGoogleAuth() {
    // 1. PRIMER: Comprovar si ja hi ha token guardat a localStorage (sessió persistent)
    let accessToken = localStorage.getItem("googleAccessToken");
    
    if (accessToken) {
        console.log("🔐 Token trobat a localStorage. Usant sessió persistent...");
        googleAccessToken = accessToken;
        driveReady = true;
        
        // Recuperar driveFolderId de localStorage si existeix
        const savedFolderId = localStorage.getItem("driveFolderId");
        if (savedFolderId) {
            driveFolderId = savedFolderId;
            console.log("✅ driveFolderId carregat de localStorage");
        }
        
        updateLoginStatus(true);
        
        // Sincronitzar immediatament
        await syncDriveData();
        return;
    }
    
    // 2. SEGON: Comprovar token a la URL (después de OAuth redirect)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    accessToken = hashParams.get('access_token');
    const expiresIn = hashParams.get('expires_in');
    
    if (accessToken) {
        console.log("✨ Token rebut d'OAuth. Guardant a localStorage...");
        googleAccessToken = accessToken;
        
        // GUARDAR TOKEN A LOCALSTORAGE per persistència
        localStorage.setItem("googleAccessToken", accessToken);
        
        // Guardar temps d'expiració (Google dona 3600 segons = 1 hora)
        if (expiresIn) {
            tokenExpirationTime = Date.now() + (parseInt(expiresIn) * 1000);
            localStorage.setItem("tokenExpirationTime", tokenExpirationTime.toString());
            console.log(`⏱️ Token válid fins a: ${new Date(tokenExpirationTime).toLocaleTimeString()}`);
        }
        
        driveReady = true;
        
        // Netejar la URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        updateLoginStatus(true);
        
        // Crear/verificar carpeta si no existeix
        if (!driveFolderId) {
            await ensureAppFolder();
        }
        
        // Sincronitzar
        await syncDriveData();
        return;
    }
    
    // 3. TERCERO: Mostrar botó de login si no hi ha sessió
    updateLoginStatus(false);
    
    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleLogin
    });

    google.accounts.id.renderButton(
        document.getElementById("googleLoginBtn"),
        { theme: "outline", size: "small" }
    );

    google.accounts.id.prompt();
}

// Actualitzar l'estat visual de connexió
function updateLoginStatus(isLoggedIn) {
    const loginBtn = document.getElementById("googleLoginBtn");
    const logoutBtn = document.getElementById("googleLogoutBtn");
    const header = document.querySelector("header");
    
    if (isLoggedIn) {
        loginBtn.classList.add("hidden");
        logoutBtn.classList.remove("hidden");
        
        // Afegir indicador visual de "Connectat"
        if (header) {
            header.classList.add("logged-in");
            header.classList.remove("logged-out");
        }
        
        console.log("✅ Estado: CONNECTAT a Google Drive");
    } else {
        loginBtn.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
        
        // Afegir indicador visual de "No connectat"
        if (header) {
            header.classList.add("logged-out");
            header.classList.remove("logged-in");
        }
        
        console.log("❌ Estado: NO CONNECTAT");
    }
}


// Funció per sincronitzar dades del Drive
async function syncDriveData() {
    try {
        console.log("🔄 Sincronitzant dades del Drive...");
        
        // Crear/verificar carpeta si no existeix
        if (!driveFolderId) {
            await ensureAppFolder();
        }
        
        // Carregar tots els workspaces disponibles
        await loadAllDriveWorkspaces();
        
        // Carregar el workspace actual del Drive
        const driveData = await loadWorkspaceFromDrive(currentWorkspace);
        
        // Si hi ha dades del Drive, usar-les; sinó, inicialitzar
        if (driveData && driveData.length > 0) {
            cards = driveData;
            console.log(`✅ Carregades ${cards.length} targetes del Drive`);
        } else {
            console.log("ℹ️ No hi ha dades al Drive. Usant dades locals.");
        }
        
        // Renderitzar interfície
        initCards();
        applySearchAndFilterToDOM();
        
        // Iniciar sincronització periòdica
        startPeriodicSync();
        
        console.log("✅ Sincronització completada. Connectat a Google Drive.");
        
    } catch (err) {
        console.error("❌ Error sincronitzant:", err);
    }
}

async function handleGoogleLogin(response) {

    googleAuthenticated = true;
    google.accounts.id.disableAutoSelect();

    // Obrir finestra per a l'Implicit Flow
    const clientId = GOOGLE_CLIENT_ID;
    
    // Calcular el redirect_uri correcte (sense index.html)
    const pathWithoutFile = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
    const redirectUri = window.location.origin + pathWithoutFile;
    
    const scope = GOOGLE_SCOPES;
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `response_type=token&` +
        `scope=${encodeURIComponent(scope)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `prompt=consent`;
    
    console.log("Redirect URI:", redirectUri);
    // Redirigir a l'URL d'autenticació
    window.location.href = authUrl;
}


let syncInterval = null;

async function startPeriodicSync() {
    if (!driveReady) return;
    
    // Sincronitzar cada 3 minuts
    syncInterval = setInterval(async () => {
        console.log("🔄 Sincronitzant amb Google Drive...");
        
        try {
            // Carregar el workspace actual del Drive
            await loadWorkspaceFromDrive(currentWorkspace);
            
            // Actualitzar la visualització si ha canviat
            const newCardsCount = cards.length;
            const localCardsCount = JSON.parse(localStorage.getItem(currentWorkspace) || "[]").length;
            
            if (newCardsCount !== localCardsCount) {
                console.log("✅ Canvis detectats des d'altres dispositius. Actualitzant...");
                initCards();
                applySearchAndFilterToDOM();
            }
        } catch (err) {
            console.error("Error en sincronització periòdica:", err);
        }
    }, 3 * 60 * 1000); // 3 minuts
}

function stopPeriodicSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}


async function loadAllDriveWorkspaces() {
    if (!driveReady || !googleAccessToken) return [];

    try {
        // Buscar fitxers JSON a la carpeta (si existeix)
        const query = `mimeType='application/json' and trashed=false${driveFolderId ? ` and '${driveFolderId}' in parents` : ''}`;
        const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&pageSize=100&fields=files(id,name,modifiedTime)`;

        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        
        // Detectar si token expirat
        if (res.status === 401) {
            const shouldRetry = await handleDriveResponse(res);
            if (shouldRetry) {
                return await loadAllDriveWorkspaces();
            }
            return [];
        }
        
        const data = await res.json();

        const files = data.files || [];

        files.forEach(file => {
            const workspaceName = file.name.replace(".json", "");
            localStorage.setItem(workspaceName + "_driveId", file.id);
            localStorage.setItem(workspaceName + "_driveMtime", new Date(file.modifiedTime).getTime());
        });

        console.log(`✅ ${files.length} workspaces sincronitzats des de Google Drive`);
        return files;
    } catch (err) {
        console.error("❌ Error carregant workspaces de Drive:", err);
        return [];
    }
}


/* ============================================================
   INICIALITZAR INTERFÍCIE (Render B complet)
============================================================ */

document.addEventListener("DOMContentLoaded",()=>{

    updateLastSelectedCardColorUI(lastSelectedCardColor);
    selectedAddColorEl.style.background = selectedAddColor;

    initCards();                 // del Part 3
    rebuildFilters();            // filtres OR
    applySearchAndFilterToDOM(); // refresc visual
    buildTagSuggestions();       // suggeriments formulari
    
    // INICIALITZAR GOOGLE AUTH (nova REST API)
    window.addEventListener("load", () => {
        const wait = setInterval(() => {
            if (typeof google !== "undefined") {
                clearInterval(wait);
                console.log("Google API carregat!");
                initGoogleAuth().catch(err => console.error("Error iniciant Google Auth:", err));
            }
        }, 100);
    });
	
	document.getElementById("toggleDarkMode").onclick = e => { e.stopPropagation(); toggleTheme(); };
	document.getElementById("exportBtn").onclick = e => { e.stopPropagation(); exportCards(); };
	document.getElementById("importBtn").onclick = e => { e.stopPropagation(); document.getElementById("importFileInput").click(); };
	
	document.getElementById("importFileInput").addEventListener("change", e => {
		const file = e.target.files[0];
		if(!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			try {
				const data = JSON.parse(reader.result);
				if(!Array.isArray(data)){
					alert("Fitxer JSON no vàlid");
					return;
				}
				cards = data;
				save();
				initCards();          // Render B
				rebuildFilters();
				applySearchAndFilterToDOM();
			} catch(err){
				alert("Error carregant el fitxer.");
			}
		};
		reader.readAsText(file);
	});


	
	let draggedEl = null;
	
	function dragStartHandler(e){
		const dragSource = e.target;

		// Només permet drag si és header o colorBar
		if (!dragSource.classList.contains("cardHeader") &&
			!dragSource.classList.contains("cardColorBar")) {
			e.preventDefault();
			return;
		}

		const cardEl = dragSource.closest(".card");
		if(!cardEl) return;

		draggedEl = cardEl;
		cardEl.classList.add("dragging");
		e.dataTransfer.effectAllowed = "move";
	}


	cardContainer.addEventListener("dragstart", dragStartHandler);

	cardContainer.addEventListener("dragover",e=>{
		e.preventDefault();
		const el = e.target.closest(".card");
		if(!el || el === draggedEl) return;

		const rect = el.getBoundingClientRect();
		const mid = rect.top + rect.height/2;

		if(e.clientY < mid){
			cardContainer.insertBefore(draggedEl, el);
		} else {
			cardContainer.insertBefore(draggedEl, el.nextSibling);
		}
	});

	cardContainer.addEventListener("dragend",()=>{
		draggedEl.classList.remove("dragging");

		const ids = [...cardContainer.children].map(el=>el.dataset.id);
		cards.sort((a,b)=> ids.indexOf(a.id) - ids.indexOf(b.id));

		save();
		draggedEl=null;
	});
	
	/* ------------------------------
       QUADRÍCULA — MIDA TARGETES
    ------------------------------ */

    const columnSlider = document.getElementById("columnSlider");

    function applyColumns(value){
        cardContainer.classList.remove(
            "columns-1","columns-2","columns-3","columns-4","columns-5"
        );
        cardContainer.classList.add(`columns-${value}`);
    }

    // Restaurar valor guardat
    const savedCols = localStorage.getItem("cardColumns") || "5"; // 5 = auto
    columnSlider.value = savedCols;
    applyColumns(savedCols);

    // Quan l’usuari mou el slider
    columnSlider.oninput = () => {
        localStorage.setItem("cardColumns", columnSlider.value);
        applyColumns(columnSlider.value);
    };

    // RICH TEXT (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Z, Ctrl+Y)
    document.addEventListener("keydown", e => {
        const active = document.activeElement;

        if (!active || !active.classList.contains("bodyText")) return;

        // Bold
        if (e.ctrlKey && e.key.toLowerCase() === "b") {
            e.preventDefault();
            document.execCommand("bold");
            return;
        }

        // Italic
        if (e.ctrlKey && e.key.toLowerCase() === "i") {
            e.preventDefault();
            document.execCommand("italic");
            return;
        }

        // Underline
        if (e.ctrlKey && e.key.toLowerCase() === "u") {
            e.preventDefault();
            document.execCommand("underline");
            return;
        }

        // Undo (CTRL+Z)
        if (e.ctrlKey && e.key.toLowerCase() === "z") {
            // IMPORTANT: NO tocar, deixem que el browser ho faci
            return;
        }

        // Redo (CTRL+Y)
        if (e.ctrlKey && e.key.toLowerCase() === "y") {
            return;
        }
    });

    const searchToggleBtn = document.getElementById("searchToggleBtn");
    const searchInput     = document.getElementById("searchInput");
    const searchWrapper   = document.getElementById("searchWrapper");

    searchToggleBtn.onclick = e => {
        e.stopPropagation();

        const opened = searchInput.classList.contains("active");

        if (!opened) {
            searchInput.classList.remove("hidden");
            searchInput.classList.add("active");
            setTimeout(() => searchInput.focus(), 50);
        } else {
            // NOMÉS tanquem si està buit
            if (searchInput.value.trim() === "") {
                searchInput.classList.remove("active");
                searchInput.classList.add("hidden");
            }
        }

    };

    // Tancar si es clica fora
    document.addEventListener("click", e => {
        if (!searchWrapper.contains(e.target)) {
            // NOMÉS tanquem si està buit
            if (searchInput.value.trim() === "") {
                searchInput.classList.remove("active");
                searchInput.classList.add("hidden");
            }
        }
    });


    // ESC → tanca
    searchInput.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            searchInput.classList.remove("active");
            searchInput.classList.add("hidden");
            searchInput.value = "";
            applySearchAndFilterToDOM();
        }
    });

    // Cerca en temps real
    searchInput.addEventListener("input", applySearchAndFilterToDOM);

    const appTitle = document.getElementById("appTitle");

    appTitle.innerText = currentWorkspace;

    // guardar només el títol visual
    appTitle.addEventListener("input", () => {
        localStorage.setItem("appTitle", currentWorkspace); // sempre mateix workspace
    });

    const workspaceBtn = document.getElementById("workspaceSelectorBtn");
    const workspaceDropdown = document.getElementById("workspaceDropdown");

    workspaceBtn.onclick = e => {
        e.stopPropagation();
        buildWorkspaceDropdown();
        workspaceDropdown.classList.toggle("hidden");
    };

    document.addEventListener("click", () => {
        workspaceDropdown.classList.add("hidden");
    });

    clearFiltersBtn.onclick = ()=>{
		activeFilters = [];
		searchInput.value = "";
		rebuildFilters();           // <-- AFEGIT (actualitza visualment)
		applySearchAndFilterToDOM();
	};


    document.getElementById("googleLogoutBtn").onclick = () => {
        googleAuthenticated = false;
        driveReady = false;
        googleAccessToken = null;
        driveFolderId = null;
        tokenExpirationTime = null;
        
        // Netejar tokens de localStorage
        localStorage.removeItem("googleAccessToken");
        localStorage.removeItem("driveFolderId");
        localStorage.removeItem("tokenExpirationTime");
        
        // Aturar sincronitzacions
        stopPeriodicSync();
        stopTokenRefresh();
        
        // Actualitzar estado visual
        updateLoginStatus(false);

        alert("Desconnectat de Google Drive");
    };
});

/* window.addEventListener("load", () => {

    // esperar fins que existeixi gapi
    const wait = setInterval(() => {
        if (typeof gapi !== "undefined") {
            clearInterval(wait);

            gapi.load("client:auth2", () => {
                console.log("GAPI carregat!");
                initGoogleAuth();   // Ara sí!
            });
        }
    }, 100);
}); */

/*
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js")
        .then(() => console.log("Service Worker registrat"))
        .catch(err => console.error("Error SW:", err));
}*/
