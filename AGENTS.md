# Echo Gestion — Guide de Setup pour Agents IA

## 🏢 Présentation du Projet

**Echo Gestion v2.0** est une application web de gestion d'entreprise complète (RH, Stock, Caisse, Production, Comptabilité) construite avec **React + Vite + TypeScript**, packagée en **application desktop Electron** (Windows). Elle fonctionne en mode **hybride online/offline** grâce à une base locale IndexedDB (Dexie) synchronisée avec **Firebase Firestore**.

---

## 🛠️ Stack Technique

| Couche | Technologie |
|---|---|
| UI Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Desktop Shell | Electron 43 |
| CSS | Tailwind CSS 3 |
| Base de données locale | Dexie (IndexedDB) |
| Base de données cloud | Firebase Firestore |
| Authentification | Firebase Auth (Email/Password + Microsoft SSO) |
| Stockage fichiers | Firebase Storage |
| IA Copilote | Mistral AI (mistral-large-latest + pixtral-12b-2409) |
| Export PDF | jsPDF + jspdf-autotable |
| Export Excel | xlsx + xlsx-js-style |

---

## 🗂️ Architecture du Code

```
src/
├── App.tsx                    # Point d'entrée UI, router par onglets, bus d'événements IA
├── index.css                  # Styles globaux Tailwind + variables CSS (--brand-color)
├── main.tsx                   # Montage React DOM
├── config/
│   ├── firebase.ts            # Init Firebase App, Auth, Firestore, Storage
│   └── constants.ts           # SITES, MOIS, CATEGORIES, clés localStorage/AppSettings
├── context/
│   └── AuthContext.tsx        # Gestion auth (login email/Microsoft, sessions, PIN, rôles)
├── db/
│   └── database.ts            # Schéma Dexie (toutes les tables et types TS)
├── services/
│   ├── syncEngine.ts          # Synchronisation bidirectionnelle Dexie ↔ Firestore
│   ├── backupService.ts       # Export/Import JSON + Import CSV employés
│   ├── mistralService.ts      # Client Mistral AI (tools, function calling, vision)
│   └── pdfGenerator.ts        # Utilitaires de génération PDF (en-tête marque, pied de page)
├── hooks/
│   └── useExports.ts          # Hook centralisé pour tous les exports PDF/Excel
├── utils/
│   └── exportHelpers.ts       # Fonctions communes des exports (header PDF, footer)
├── pages/
│   ├── Login.tsx              # Écran de connexion (Email + Microsoft SSO)
│   ├── DashboardRH.tsx        # Tableau de bord analytique (KPIs, graphiques)
│   ├── Employees.tsx          # CRUD employés (RH)
│   ├── Attendance.tsx         # Pointage journalier par site
│   ├── Salaires.tsx           # Gestion des salaires et primes
│   ├── Catalogue.tsx          # Catalogue produits + panier
│   ├── Caisse.tsx             # POS (point de vente) avec panier
│   ├── Stock.tsx              # Gestion des stocks et inventaire
│   ├── Transactions.tsx       # Historique des ventes et dépenses
│   ├── Production.tsx         # Suivi de production et matières premières
│   ├── Comptes.tsx            # Comptabilité générale
│   └── Settings.tsx           # Paramètres (thème, entreprise, utilisateurs, sécurité)
└── components/
    ├── Layout.tsx              # Navigation sidebar/bottom tabs, header responsive
    ├── AICopilotChat.tsx       # Chatbot IA flottant (texte, voix, vision, JSON backup)
    ├── ExportButton.tsx        # Composant bouton d'export réutilisable
    ├── PinLockModal.tsx        # Écran de verrouillage PIN
    ├── PinVerifyModal.tsx      # Vérification PIN email à 6 chiffres
    ├── PinSetupModal.tsx       # Configuration PIN
    ├── modals/                 # Modales métier (ajout produit, ajout employé, etc.)
    └── ui/                     # Composants UI génériques (Toast, Badge, etc.)
```

---

## ⚙️ Configuration Obligatoire

### 1. Firebase (`src/config/firebase.ts`)
Le projet est configuré sur le projet Firebase `echo-gestion-d2fd2`. Les clés sont déjà hardcodées dans le fichier.  
**Ne pas changer** la configuration Firebase sans reconfigurer les règles Firestore.

### 2. Clé API Mistral (`src/services/mistralService.ts`)
La clé API Mistral est stockée dans Firestore sous le document :
```
appSettings / mistral_api_key  →  { value: "votre_clé_mistral" }
```
Elle est chargée dynamiquement au démarrage via `initializeMistral()`. **Ne pas la coder en dur dans le source.**

### 3. Microsoft SSO (`src/config/firebase.ts`)
```ts
export const MICROSOFT_TENANT_ID = "d64f809a-e0da-4724-abb6-6f2aac3bdef9";
export const ALLOWED_EMAIL_DOMAINS = ["echosdechezmoi.com"];
```

---

## 📦 Installation et Démarrage

```bash
# Cloner et installer (Utiliser absolument --legacy-peer-deps suite aux conflits React Native / Expo)
npm install --legacy-peer-deps

# Démarrer en mode développement web (navigateur)
npm run dev

# Démarrer en mode développement desktop (Electron)
npm run electron:dev

# Build production web
npm run build

# Build installateur Windows (.exe)
npm run electron:build
```

---

## 🗄️ Base de Données

### Tables Dexie (IndexedDB local)
| Table | Description |
|---|---|
| `inventory` | Produits du catalogue |
| `dailyRecords` | Ventes journalières |
| `expenses` | Dépenses |
| `clients` | Clients |
| `suppliers` | Fournisseurs |
| `quotes` | Devis |
| `income` | Revenus additionnels |
| `productions` | Enregistrements de production |
| `rawMaterials` | Matières premières |
| `rhAppData` | Données RH (employés, pointage, salaires) — 1 seule ligne clé `rh_app_data` |
| `appSettings` | Paramètres applicatifs (thème, logo, clé API, etc.) |
| `userAccounts` | Comptes utilisateurs (cache local) |

### Synchronisation Firestore
Le moteur `syncEngine.ts` synchronise automatiquement en arrière-plan toutes les tables vers Firestore. Les empreintes de hash (stockées dans `localStorage` sous `synchash_<table>_<id>`) évitent les écritures inutiles.

---

## 🔐 Système d'Authentification

### Rôles
| Rôle | Accès |
|---|---|
| `admin` | Accès complet à tout |
| `manager` | Accès complet sauf certaines sections sensibles |
| `viewer` | Lecture seule |
| `user` | Lecture + Ajout + Édition (pas de suppression) |

### Persistance de Session
- **En ligne** : `onAuthStateChanged` Firebase restaure la session automatiquement après rechargement.
- **Hors ligne** : La session est mise en cache dans `localStorage` (`stock_expert_user_session`).
- **Sécurité PIN** : Un PIN optionnel peut être activé depuis les paramètres. Stocké haché dans `localStorage` (`echo_security_settings`).
- **`authLoading`** : État de chargement initial (évite le flash de la page de login lors du rechargement de page).

---

## 🤖 IA Copilote (Mistral AI)

### Modèles utilisés
- **Texte** : `mistral-large-latest` (conversation, analyse, génération de rapports)
- **Vision** : `pixtral-12b-2409` (analyse d'images : reçus, factures, photos)

### Outils (Function Calling)
| Outil | Description |
|---|---|
| `addExpense` | Crée une dépense directement dans Firestore depuis une description ou une photo |
| `navigateToTab` | Navigue vers un onglet de l'application |
| `triggerExport` | Génère et télécharge un rapport PDF ou Excel prédéfini |
| `generateCustomReportPDF` | Génère un rapport PDF sur mesure (titre, sections, tableaux) |
| `mergeBackupData` | Fusionne un fichier de sauvegarde JSON importé — insère uniquement les éléments manquants sans doublon |

### Import de Sauvegarde JSON via le Chat
1. Cliquer sur **Trombone** 📎 dans le chatbot
2. Sélectionner le fichier `echo_backup_YYYY-MM-DD.json`
3. Un badge 📄 s'affiche avec le nom du fichier
4. Écrire : *"Insère les données manquantes de cette sauvegarde"*
5. L'IA appelle `mergeBackupData` → fusion incrémentale sécurisée dans IndexedDB

---

## 📤 Exports

Tous les exports passent par le hook `useExports.ts`. Les rapports disponibles sont :
- **Présences** (PDF + Excel) — filtrés par mois/année
- **Personnel** (PDF + Excel)
- **Stock / Inventaire** (PDF + Excel)
- **Dépenses** (PDF + Excel)
- **Historique des ventes** (PDF + Excel)
- **Production** (PDF + Excel)
- **Matières premières** (PDF + Excel)

---

## 🎨 Système de Design

- **Couleur de marque** : Variable CSS `--brand-color` (défaut `#14522D` — vert foncé)
  - Configurable depuis **Paramètres → Apparence**
  - Stockée dans `appSettings` sous la clé `stock_expert_theme_color`
- **Logo de marque** : Le logo est géré par le composant partagé `AppLogo.tsx` (basé sur le hook `useAppLogo.ts`). Pour éviter tout conflit d'affichage (ex: logo PNG carré avec fond blanc), le composant force le style CSS inline circulaire (`borderRadius: 50%` + `overflow: hidden` + `objectFit: contain`).
- **Mode Glassmorphism** : Activable depuis les paramètres. Variables `--glass-bg` et `--glass-border` injectées dynamiquement.
- **Police** : Inter (Google Fonts)
- **Dark Mode** : Classe Tailwind `dark:` appliquée globalement

---

## 🧪 Règles de Développement pour les Agents

1. **Ne jamais casser la compilation TypeScript** — toujours vérifier avec `npm run build` avant de terminer.
2. **Ne pas modifier le schéma Dexie** (`src/db/database.ts`) sans incrémenter le numéro de version de la base et sans gérer la migration.
3. **Ajouter un nouvel onglet** → déclarer dans `TabId` (AuthContext), `Layout.tsx` (navigation) et le `switch` de `renderActivePage()` dans `App.tsx`.
4. **Clé API Mistral** → toujours chargée depuis Firestore, jamais en dur dans le code.
5. **Exports PDF/Excel** → toujours passer par `useExports.ts` et `exportHelpers.ts` pour respecter la charte graphique.
6. **Synchronisation** → toujours appeler `getObjectHash()` et stocker le hash dans `localStorage` après une insertion manuelle en masse pour éviter des ré-écritures Firestore inutiles.
7. **Affichage du Logo** → Utiliser systématiquement le composant `<AppLogo />` au lieu d'intégrer une balise `<img />` ou des icônes de substitution manuellement afin de garantir le rendu circulaire sur tous les supports.
8. **Dépendances Electron** → En cas de crash au lancement d'Electron pour module manquant (ex: 'ms' requis par jsonwebtoken/@azure/msal-node), s'assurer que la dépendance soit inscrite de manière explicite dans les `dependencies` du `package.json` et installée via `npm install --legacy-peer-deps`.
