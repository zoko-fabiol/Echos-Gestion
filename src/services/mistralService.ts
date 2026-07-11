import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';

let cachedApiKey: string | null = null;

/**
 * Charge la clé API Mistral depuis Firestore en arrière-plan
 */
export const initializeMistral = async (): Promise<boolean> => {
  try {
    const docRef = doc(firestore, 'config', 'mistral');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      cachedApiKey = docSnap.data().apiKey;
      console.log('[IA Copilot] Initialisé avec succès.');
      return true;
    } else {
      console.warn("[IA Copilot] Aucune configuration apiKey trouvée dans config/mistral.");
      return false;
    }
  } catch (error) {
    console.error("[IA Copilot] Erreur d'initialisation de la clé :", error);
    return false;
  }
};

// --- DÉFINITION DES OUTILS (FUNCTION CALLING) ---
const tools = [
  {
    type: "function" as const,
    function: {
      name: "getInventory",
      description: "Récupère tout l'inventaire des produits directement depuis Firebase (stocks, prix d'achat/vente, type de produit).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getEmployees",
      description: "Récupère la liste des employés de l'entreprise directement depuis Firebase (nom, prénom, poste/site, salaire de base, statut).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getAttendance",
      description: "Récupère les absences et présences des employés directement depuis Firebase pour un mois et une année donnés.",
      parameters: {
        type: "object",
        properties: {
          year: { type: "number", description: "L'année sur 4 chiffres (ex: 2026)." },
          month: { type: "number", description: "Le mois recherché de 1 à 12 (ex: 3 pour Mars, 12 pour Décembre)." }
        },
        required: ["year", "month"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "getExpenses",
      description: "Récupère l'historique des dépenses récentes directement depuis Firebase.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateProductPrice",
      description: "Met à jour le prix de vente d'un produit spécifique directement dans Firebase.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "L'identifiant unique numérique du produit." },
          newSalePrice: { type: "number", description: "Le nouveau prix de vente en euros." }
        },
        required: ["productId", "newSalePrice"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addExpense",
      description: "Enregistre une nouvelle dépense directement dans la base de données Firebase.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Le montant de la dépense en euros." },
          category: { type: "string", description: "La catégorie de la dépense (ex: matières premières, transport, salaire, autre)." },
          description: { type: "string", description: "La description explicative de la dépense." }
        },
        required: ["amount", "category", "description"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "navigateToTab",
      description: "Permet de naviguer vers un onglet ou une page spécifique de l'application (ex: caisse, stock, présences, salaires, employés, paramètres).",
      parameters: {
        type: "object",
        properties: {
          tabId: { 
            type: "string", 
            description: "L'identifiant textuel exact de la page à ouvrir. Valeurs possibles : dashboard (tableau de bord RH), employes (effectifs), pointage (présences/pointage), salaires (salaires), catalogue, caisse, stock, transactions, production, comptes (utilisateurs), settings (paramètres)."
          }
        },
        required: ["tabId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "triggerExport",
      description: "Déclenche l'exportation et le téléchargement d'un rapport de données (stocks, dépenses, ventes, employés, présences) au format PDF ou Excel.",
      parameters: {
        type: "object",
        properties: {
          reportType: { 
            type: "string", 
            enum: ["attendance", "personnel", "inventory", "expenses", "salesHistory", "production", "rawMaterials"],
            description: "Le type de rapport à exporter." 
          },
          format: { type: "string", enum: ["pdf", "excel"], description: "Le format de fichier souhaité (pdf ou excel)." },
          year: { type: "number", description: "L'année pour les rapports filtrés par date (ex: 2026)." },
          month: { type: "number", description: "Le mois recherché de 1 à 12 (ex: 2 pour février, 3 pour mars)." }
        },
        required: ["reportType"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "generateCustomReportPDF",
      description: "Génère un rapport PDF sur mesure mis en page de manière professionnelle avec un titre, un sous-titre et des sections textuelles ou des tableaux à partir des données analysées par l'IA.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Le titre principal du rapport (ex: Rapport d'Anomalies Financières)." },
          subtitle: { type: "string", description: "Le sous-titre du rapport (ex: Analyse des dépenses du 10 au 17 juin 2026)." },
          sections: {
            type: "array",
            description: "La liste ordonnée des sections du rapport.",
            items: {
              type: "object",
              properties: {
                sectionTitle: { type: "string", description: "Le titre de la section (ex: 1. Synthèse des Dépenses)." },
                content: { type: "string", description: "Le texte de la section rédigé en paragraphes." },
                table: {
                  type: "object",
                  description: "Optionnel : un tableau de données à afficher sous le texte de cette section.",
                  properties: {
                    head: {
                      type: "array",
                      description: "Les noms des colonnes (ex: ['Problème', 'Exemples', 'Risques', 'Recommandations']).",
                      items: { type: "string" }
                    },
                    body: {
                      type: "array",
                      description: "Les lignes du tableau, chaque ligne étant un tableau de chaînes correspondant aux colonnes.",
                      items: {
                        type: "array",
                        items: { type: "string" }
                      }
                    }
                  },
                  required: ["body"]
                }
              },
              required: ["sectionTitle"]
            }
          }
        },
        required: ["title", "subtitle", "sections"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "mergeBackupData",
      description: "Fusionne les données du fichier de sauvegarde JSON importé dans la base de données. N'ajoute que les éléments manquants (produits, dépenses, ventes, etc.) sans écraser les données existantes.",
      parameters: {
        type: "object",
        properties: {}
      }
    }
  }
];

const getStatusLabel = (status: number) => {
  switch (status) {
    case 1: return 'Présent';
    case 2: return 'Absent';
    case 3: return 'Justifié';
    default: return 'Inconnu';
  }
};

// --- EXÉCUTEUR D'OUTILS SUR FIREBASE FIRESTORE DIRECTEMENT ---
const executeTool = async (name: string, args: any) => {
  console.log(`[IA Copilot] Outil Firebase : ${name}`, args);
  try {
    switch (name) {
      case "getInventory": {
        const querySnapshot = await getDocs(collection(firestore, 'inventory'));
        const items = querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        return { success: true, count: items.length, data: items };
      }
      
      case "getEmployees": {
        const docRef = doc(firestore, 'rhAppData', 'current');
        const docSnap = await getDoc(docRef);
        let employees = [];
        if (docSnap.exists() && docSnap.data().payload) {
          const parsed = JSON.parse(docSnap.data().payload);
          employees = parsed.employees || [];
        }
        return { success: true, count: employees.length, data: employees };
      }

      case "getAttendance": {
        const { year, month } = args;
        const dbMonthIndex = month - 1;
        
        const docRef = doc(firestore, 'rhAppData', 'current');
        const docSnap = await getDoc(docRef);
        
        let employees = [];
        let attendance: Record<string, number> = {};
        
        if (docSnap.exists() && docSnap.data().payload) {
          const parsed = JSON.parse(docSnap.data().payload);
          employees = parsed.employees || [];
          attendance = parsed.attendance || {};
        }

        const results: { employeeName: string; date: string; status: string }[] = [];
        
        Object.entries(attendance).forEach(([key, statusValue]) => {
          const parts = key.split('_');
          if (parts.length === 2) {
            const empId = Number(parts[0]);
            const datePart = parts[1];
            const dateParts = datePart.split('-');
            
            if (dateParts.length === 3) {
              const keyYear = Number(dateParts[0]);
              const keyMonth = Number(dateParts[1]);
              const keyDay = Number(dateParts[2]);

              if (keyYear === year && keyMonth === dbMonthIndex) {
                const emp = employees.find((e: any) => e.id === empId);
                const employeeName = emp ? `${emp.prenom} ${emp.nom}` : `ID ${empId}`;
                results.push({
                  employeeName,
                  date: `${keyDay}/${month}/${year}`,
                  status: getStatusLabel(statusValue)
                });
              }
            }
          }
        });

        return { 
          success: true, 
          year, 
          month, 
          totalRecords: results.length,
          data: results 
        };
      }

      case "getExpenses": {
        const querySnapshot = await getDocs(collection(firestore, 'expenses'));
        const expenses = querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        return { success: true, count: expenses.length, data: expenses.slice(-20) };
      }

      case "updateProductPrice": {
        const { productId, newSalePrice } = args;
        const docRef = doc(firestore, 'inventory', String(productId));
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
          return { success: false, message: `Produit avec ID ${productId} introuvable dans Firebase.` };
        }
        
        await updateDoc(docRef, { salePrice: newSalePrice });
        return { success: true, message: `Le prix du produit "${docSnap.data().name || productId}" a été mis à jour à ${newSalePrice}€ dans Firebase.` };
      }

      case "addExpense": {
        const { amount, category, description } = args;
        const id = Date.now();
        const date = new Date().toISOString().split('T')[0];
        const docRef = doc(firestore, 'expenses', String(id));
        
        await setDoc(docRef, {
          id,
          date,
          amount,
          category,
          description,
          type: 'general'
        });
        return { success: true, message: `Dépense de ${amount}€ enregistrée avec succès dans Firebase.` };
      }

      case "navigateToTab": {
        const { tabId } = args;
        window.dispatchEvent(new CustomEvent('ai-action', { detail: { action: 'navigateToTab', args: { tabId } } }));
        return { success: true, message: `L'application a changé d'onglet pour afficher la page "${tabId}".` };
      }

      case "triggerExport": {
        const { reportType, format = "pdf", year, month } = args;
        window.dispatchEvent(new CustomEvent('ai-action', { detail: { action: 'triggerExport', args: { reportType, format, year, month } } }));
        return { success: true, message: `L'exportation du rapport "${reportType}" au format ${format} a été lancée.` };
      }

      case "generateCustomReportPDF": {
        const { title, subtitle, sections } = args;
        window.dispatchEvent(new CustomEvent('ai-action', { detail: { action: 'generateCustomReportPDF', args: { title, subtitle, sections } } }));
        return { success: true, message: `Le rapport PDF "${title}" a été généré et proposé en téléchargement.` };
      }

      case "mergeBackupData": {
        window.dispatchEvent(new CustomEvent('ai-action', { detail: { action: 'mergeBackupData', args: {} } }));
        return { success: true, message: "La fusion des données manquantes de la sauvegarde a été lancée avec succès." };
      }

      default:
        return { success: false, error: "Outil non supporté." };
    }
  } catch (error: any) {
    console.error(`[IA Copilot] Erreur d'exécution Firebase de l'outil ${name}:`, error);
    return { success: false, error: error.message };
  }
};

export interface AskMistralResult {
  content: string;
  actionTriggered?: {
    name: string;
    args: any;
  };
}

/**
 * Envoie un message à Mistral AI et gère les appels d'outils et la vision (images)
 */
export const askMistral = async (
  userMessage: string, 
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  imageBase64?: string | null
): Promise<AskMistralResult> => {
  if (!cachedApiKey) {
    const initialized = await initializeMistral();
    if (!initialized || !cachedApiKey) {
      throw new Error("L'assistant IA n'est pas initialisé ou la clé API est absente.");
    }
  }

  const currentDateStr = new Date().toLocaleDateString('fr-FR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const currentTimeStr = new Date().toLocaleTimeString('fr-FR', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const systemPrompt = {
    role: 'system' as const,
    content: `Tu es un assistant virtuel expert intégré dans "Echo Gestion", une application de gestion d'entreprise.
Tu as accès à des outils pour interagir directement avec la base de données cloud Firebase (produits, employés, absences, dépenses).
Si l'utilisateur pose une question sur les stocks, les employés, les absences ou les finances, ou s'il envoie une image de facture/reçu, appelle systématiquement l'outil correspondant pour obtenir ou insérer les données réelles en temps réel.
Ensuite, formule une réponse claire, rédigée, concise et polie en français.

CONTEXTE TEMPOREL :
- Aujourd'hui nous sommes le : ${currentDateStr}.
- L'heure actuelle est : ${currentTimeStr}.
Utilise cette date pour situer les requêtes temporelles de l'utilisateur.

CONSIGNES DE STYLE IMPORTANTES :
- N'utilise JAMAIS de tableaux Markdown (pas de barres verticales '|' ou de tirets horizontaux successifs).
- N'utilise PAS d'astérisques excessifs (pas de gras '**' à outrance). Utilise le gras uniquement de manière très ciblée.
- Présente les listes d'informations de manière très propre et aérée en utilisant des tirets simples (-) et des retours à la ligne clairs.
Exemple de format propre :
- Prénom Nom : X jours d'absence (les 12, 14 et 15 mars)`
  };

  // Structurer le contenu pour la vision si une image est présente
  const userContent = imageBase64 
    ? [
        { type: 'text', text: userMessage || "Analyse cette image." },
        { type: 'image_url', image_url: { url: imageBase64 } }
      ]
    : userMessage;

  const messages = [
    systemPrompt,
    ...history,
    { role: 'user' as const, content: userContent }
  ];

  // Si on envoie une image, on utilise le modèle pixtral-12b-2409 pour de meilleures performances vision, sinon mistral-large-latest
  const modelToUse = imageBase64 ? 'pixtral-12b-2409' : 'mistral-large-latest';

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cachedApiKey}`
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: messages,
        tools: tools,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || `Erreur serveur Mistral (Status ${response.status})`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    let lastActionTriggered: { name: string; args: any } | undefined = undefined;

    // Si Mistral a besoin d'exécuter un ou plusieurs outils
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolMessages = [];

      for (const toolCall of message.tool_calls) {
        const name = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const toolResult = await executeTool(name, args);

        if (name === "triggerExport" || name === "navigateToTab" || name === "generateCustomReportPDF" || name === "mergeBackupData") {
          lastActionTriggered = { name, args };
        }

        toolMessages.push({
          role: 'tool' as const,
          name: name,
          content: JSON.stringify(toolResult),
          tool_call_id: toolCall.id
        });
      }

      const assistantMessage = {
        role: 'assistant' as const,
        content: message.content || null,
        tool_calls: message.tool_calls
      };

      const followUpMessages = [
        systemPrompt,
        ...history,
        { role: 'user' as const, content: userContent },
        assistantMessage,
        ...toolMessages
      ];

      const followUpResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cachedApiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: followUpMessages
        })
      });

      if (!followUpResponse.ok) {
        const followUpError = await followUpResponse.json().catch(() => ({}));
        throw new Error(followUpError?.message || `Erreur lors du suivi de l'IA (Status ${followUpResponse.status})`);
      }

      const followUpData = await followUpResponse.json();
      const content = followUpData?.choices?.[0]?.message?.content || "L'action a été réalisée avec succès.";
      return { content, actionTriggered: lastActionTriggered };
    }

    return { content: message?.content || "Désolé, je n'ai pas pu formuler de réponse." };
  } catch (error: any) {
    console.error('[IA Copilot] Erreur d\'appel API :', error);
    throw new Error(error?.message || "Erreur de connexion avec l'IA.");
  }
};
