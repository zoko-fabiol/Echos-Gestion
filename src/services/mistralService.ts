import { doc, getDoc, getDocs, collection, setDoc, updateDoc } from 'firebase/firestore';
import { firestore } from '../config/firebase';
import { db } from '../db/database';
import { syncUp } from './syncEngine';

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
  },
  {
    type: "function" as const,
    function: {
      name: "addProduct",
      description: "Ajoute un nouveau produit (fini ou matière première) au catalogue de stock.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Le nom unique du produit (ex: Ciment de marque X)." },
          category: { type: "string", description: "La catégorie (ex: Électricité, Maçonnerie, Blé, etc.)." },
          type: { type: "string", enum: ["finished", "raw"], description: "Type de produit : 'finished' pour produit fini, 'raw' pour matière première." },
          stock: { type: "number", description: "La quantité initiale en stock (par défaut 0)." },
          salePrice: { type: "number", description: "Le prix de vente unitaire (FCFA)." },
          saleUnit: { type: "string", description: "L'unité de vente (ex: sac, kg, unité, paquet)." },
          purchasePrice: { type: "number", description: "Le prix d'achat unitaire moyen (FCFA)." },
          purchaseUnit: { type: "string", description: "L'unité d'achat unitaire (ex: sac, tonne, kg)." }
        },
        required: ["name", "category", "type", "salePrice", "saleUnit", "purchasePrice", "purchaseUnit"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addEmployee",
      description: "Crée une nouvelle fiche employé dans le module de gestion RH.",
      parameters: {
        type: "object",
        properties: {
          prenom: { type: "string", description: "Le prénom de l'employé." },
          nom: { type: "string", description: "Le nom de famille de l'employé." },
          site: { type: "string", description: "Le site d'affectation (ex: Chantier A, Bureau)." },
          type: { type: "string", enum: ["permanent", "temporaire"], description: "Statut contractuel : permanent ou temporaire." },
          salaireBase: { type: "number", description: "Le salaire mensuel ou journalier de base (FCFA)." },
          contact: { type: "string", description: "Le numéro de téléphone ou de contact de l'employé." }
        },
        required: ["prenom", "nom", "site", "type", "salaireBase", "contact"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "recordAttendance",
      description: "Enregistre la présence ou l'absence d'un employé pour une date donnée.",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "L'identifiant numérique unique de l'employé." },
          date: { type: "string", description: "La date au format YYYY-MM-DD (ex: 2026-03-14)." },
          status: { type: "number", enum: [1, 2, 3], description: "Le statut de pointage : 1 pour Présent, 2 pour Absent, 3 pour Justifié." }
        },
        required: ["employeeId", "date", "status"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addSale",
      description: "Enregistre une nouvelle vente dans l'historique des transactions.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "La liste des articles vendus.",
            items: {
              type: "object",
              properties: {
                productId: { type: "number", description: "L'ID unique du produit." },
                qty: { type: "number", description: "La quantité vendue." }
              },
              required: ["productId", "qty"]
            }
          }
        },
        required: ["items"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addProduction",
      description: "Enregistre un rapport de production journalier.",
      parameters: {
        type: "object",
        properties: {
          productName: { type: "string", description: "Le nom du produit fabriqué." },
          rawQuantity: { type: "number", description: "La quantité de matière première utilisée (en kg)." },
          finalQuantity: { type: "number", description: "La quantité de produit fini obtenue (en paquets/unités)." },
          totalWeight: { type: "number", description: "Le poids total généré (en kg, optionnel)." },
          description: { type: "string", description: "Commentaires ou détails de production." }
        },
        required: ["productName", "rawQuantity", "finalQuantity"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addRawMaterial",
      description: "Enregistre un mouvement ou stock de matière première (approvisionnement ou sortie).",
      parameters: {
        type: "object",
        properties: {
          productName: { type: "string", description: "Le nom de la matière première." },
          arrivedQty: { type: "number", description: "Quantité reçue en sacs (0 si aucun)." },
          outQty: { type: "number", description: "Quantité sortie pour production en sacs (0 si aucun)." },
          description: { type: "string", description: "Notes de livraison ou d'utilisation." }
        },
        required: ["productName", "arrivedQty", "outQty"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addClient",
      description: "Enregistre un nouveau client dans la base de données.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Le nom complet ou raison sociale du client." },
          phone: { type: "string", description: "Le numéro de téléphone principal du client." },
          contact: { type: "string", description: "Nom du contact ou adresse." }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addSupplier",
      description: "Enregistre un nouveau fournisseur dans la base de données.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nom complet du fournisseur." },
          phone: { type: "string", description: "Téléphone du fournisseur." },
          contact: { type: "string", description: "Adresse ou contact du fournisseur." }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "addIncome",
      description: "Enregistre une rentrée d'argent ou revenu additionnel.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Le montant du revenu (FCFA)." },
          source: { type: "string", description: "La source de la rentrée d'argent (ex: loyer, subvention, etc.)." },
          receivedBy: { type: "string", description: "Le nom de la personne ayant encaissé la somme." },
          description: { type: "string", description: "Notes explicatives." }
        },
        required: ["amount", "receivedBy", "source"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateProduct",
      description: "Modifie les informations d'un produit du catalogue (inventaire).",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "L'identifiant numérique unique du produit à modifier." },
          updates: {
            type: "object",
            description: "Les propriétés à modifier (ex: name, category, stock, salePrice, saleUnit, purchasePrice, purchaseUnit, type).",
            properties: {
              name: { type: "string" },
              category: { type: "string" },
              type: { type: "string", enum: ["finished", "raw"] },
              stock: { type: "number" },
              salePrice: { type: "number" },
              saleUnit: { type: "string" },
              purchasePrice: { type: "number" },
              purchaseUnit: { type: "string" }
            }
          }
        },
        required: ["productId", "updates"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteProduct",
      description: "Supprime définitivement un produit du catalogue (inventaire) par son ID.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number", description: "L'ID numérique unique du produit à supprimer." }
        },
        required: ["productId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateEmployee",
      description: "Met à jour la fiche d'un employé existant (salaire, poste, site, ou statut de renvoi/licenciement avec la date de renvoi).",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "L'identifiant numérique unique de l'employé." },
          updates: {
            type: "object",
            properties: {
              prenom: { type: "string" },
              nom: { type: "string" },
              site: { type: "string" },
              type: { type: "string", enum: ["permanent", "temporaire"] },
              salaireBase: { type: "number" },
              contact: { type: "string" },
              statut: { type: "string", enum: ["actif", "renvoye"] },
              dateRenvoi: { type: "string", description: "Date de renvoi au format YYYY-MM-DD (requis si statut est 'renvoye', null sinon)." },
              dateEmbauche: { type: "string" }
            }
          }
        },
        required: ["employeeId", "updates"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteEmployee",
      description: "Supprime définitivement la fiche d'un employé de la base de données par son ID.",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "number", description: "L'ID numérique unique de l'employé à supprimer." }
        },
        required: ["employeeId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateClient",
      description: "Modifie les informations d'un client.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "L'ID texte du client (ex: client_171...)." },
          updates: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              contact: { type: "string" }
            }
          }
        },
        required: ["clientId", "updates"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteClient",
      description: "Supprime définitivement un client par son ID.",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "L'ID texte du client." }
        },
        required: ["clientId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateSupplier",
      description: "Modifie les informations d'un fournisseur.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "string", description: "L'ID texte du fournisseur." },
          updates: {
            type: "object",
            properties: {
              name: { type: "string" },
              phone: { type: "string" },
              contact: { type: "string" }
            }
          }
        },
        required: ["supplierId", "updates"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteSupplier",
      description: "Supprime un fournisseur par son ID.",
      parameters: {
        type: "object",
        properties: {
          supplierId: { type: "string", description: "L'ID texte du fournisseur." }
        },
        required: ["supplierId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "updateExpense",
      description: "Modifie les détails d'une dépense enregistrée.",
      parameters: {
        type: "object",
        properties: {
          expenseId: { type: "number", description: "L'ID numérique unique de la dépense." },
          updates: {
            type: "object",
            properties: {
              amount: { type: "number" },
              category: { type: "string" },
              description: { type: "string" },
              paidAmount: { type: "number" },
              remainingAmount: { type: "number" }
            }
          }
        },
        required: ["expenseId", "updates"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteExpense",
      description: "Supprime définitivement une dépense de l'historique.",
      parameters: {
        type: "object",
        properties: {
          expenseId: { type: "number", description: "L'ID numérique unique de la dépense." }
        },
        required: ["expenseId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteSale",
      description: "Annule ou supprime définitivement une vente de l'historique par son ID.",
      parameters: {
        type: "object",
        properties: {
          saleId: { type: "number", description: "L'ID de la transaction de vente." }
        },
        required: ["saleId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteProduction",
      description: "Supprime un enregistrement de production.",
      parameters: {
        type: "object",
        properties: {
          productionId: { type: "number", description: "L'ID unique de l'enregistrement de production." }
        },
        required: ["productionId"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "deleteRawMaterial",
      description: "Supprime un enregistrement de mouvement de matière première.",
      parameters: {
        type: "object",
        properties: {
          rawMaterialId: { type: "number", description: "L'ID de la ligne de matière première." }
        },
        required: ["rawMaterialId"]
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
        const items = await db.inventory.toArray();
        return { success: true, count: items.length, data: items };
      }
      
      case "getEmployees": {
        const rawData = await db.rhAppData.get('rh_app_data');
        const employees = rawData?.value?.employees || [];
        return { success: true, count: employees.length, data: employees };
      }

      case "getAttendance": {
        const { year, month } = args;
        const dbMonthIndex = month - 1; // months in UI are 1-12, but inside data key we format year-month-day
        
        const rawData = await db.rhAppData.get('rh_app_data');
        const employees = rawData?.value?.employees || [];
        const attendance = rawData?.value?.attendance || {};

        const results: { employeeName: string; date: string; status: string }[] = [];
        
        Object.entries(attendance).forEach(([key, statusValue]) => {
          const parts = key.split('_');
          if (parts.length === 2) {
            const empId = Number(parts[0]);
            const datePart = parts[1]; // formats: YYYY-MM-DD or YYYY-M-D depending on input
            const dateParts = datePart.split('-');
            
            if (dateParts.length === 3) {
              const keyYear = Number(dateParts[0]);
              const keyMonth = Number(dateParts[1]); // Month in key is 1-indexed (e.g. 01 for Jan or 1 for Jan)
              const keyDay = Number(dateParts[2]);

              if (keyYear === year && keyMonth === month) {
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
        const expenses = await db.expenses.toArray();
        return { success: true, count: expenses.length, data: expenses.slice(-20) };
      }

      case "updateProductPrice": {
        const { productId, newSalePrice } = args;
        const product = await db.inventory.get(Number(productId));
        
        if (!product) {
          return { success: false, message: `Produit avec ID ${productId} introuvable en local.` };
        }
        
        product.salePrice = newSalePrice;
        await db.inventory.put(product);
        try { await syncUp(); } catch {}
        return { success: true, message: `Le prix du produit "${product.name}" a été mis à jour à ${newSalePrice} FCFA.`, data: product };
      }

      case "addExpense": {
        const { amount, category, description } = args;
        const id = Date.now();
        const date = new Date().toISOString().split('T')[0];
        const record = {
          id,
          date,
          amount,
          category,
          description,
          type: 'general' as const
        };
        await db.expenses.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Dépense de ${amount} FCFA enregistrée avec succès.`, data: record };
      }

      case "addProduct": {
        const id = Date.now();
        const newProduct = { id, ...args, stock: args.stock ?? 0 };
        await db.inventory.put(newProduct);
        try { await syncUp(); } catch {}
        return { success: true, message: `Produit "${args.name}" ajouté avec succès à l'inventaire.`, data: newProduct };
      }

      case "addEmployee": {
        const rawData = await db.rhAppData.get('rh_app_data');
        const rhValue = rawData?.value || { employees: [], attendance: {}, payrollExtras: {}, visibleSundays: [] };
        const newId = rhValue.employees.length > 0 ? Math.max(...rhValue.employees.map((e: any) => e.id)) + 1 : 1;
        const newEmp = {
          id: newId,
          ...args,
          statut: 'actif' as const,
          dateRenvoi: null,
          dateEmbauche: new Date().toISOString().split('T')[0]
        };
        rhValue.employees.push(newEmp);
        await db.rhAppData.put({ key: 'rh_app_data', value: rhValue });
        try { await syncUp(); } catch {}
        return { success: true, message: `Employé ${args.prenom} ${args.nom} créé avec succès.`, data: newEmp };
      }

      case "recordAttendance": {
        const { employeeId, date, status } = args;
        const rawData = await db.rhAppData.get('rh_app_data');
        const rhValue = rawData?.value || { employees: [], attendance: {}, payrollExtras: {}, visibleSundays: [] };
        const key = `${employeeId}_${date}`;
        rhValue.attendance[key] = status;
        await db.rhAppData.put({ key: 'rh_app_data', value: rhValue });
        try { await syncUp(); } catch {}
        return { success: true, message: `Pointage enregistré pour l'employé ID ${employeeId} le ${date} avec le statut ${getStatusLabel(status)}.` };
      }

      case "addSale": {
        const { items } = args;
        const saleItems = [];
        let total = 0;
        let totalCost = 0;
        for (const item of items) {
          const product = await db.inventory.get(Number(item.productId));
          if (!product) continue;
          const cost = product.purchasePrice || 0;
          const price = product.salePrice || 0;
          const qty = Number(item.qty);
          saleItems.push({
            name: product.name,
            qty,
            price,
            cost,
            total: qty * price,
            totalCost: qty * cost
          });
          total += qty * price;
          totalCost += qty * cost;
          
          // Decrement stock
          product.stock = Math.max(0, product.stock - qty);
          await db.inventory.put(product);
        }
        const record = {
          id: Date.now(),
          type: 'sale' as const,
          date: new Date().toISOString(),
          items: saleItems,
          total,
          totalCost,
          margin: total - totalCost
        };
        await db.dailyRecords.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Vente enregistrée avec succès. Total: ${total} FCFA.`, data: record };
      }

      case "addProduction": {
        const record = {
          id: Date.now(),
          date: new Date().toISOString(),
          ...args
        };
        await db.productions.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Rapport de production pour "${args.productName}" enregistré.`, data: record };
      }

      case "addRawMaterial": {
        const latest = await db.rawMaterials.where('productName').equalsIgnoreCase(args.productName).reverse().first();
        const currentStock = latest?.finalStock ?? 0;
        const finalStock = currentStock + (args.arrivedQty ?? 0) - (args.outQty ?? 0);
        const record = {
          id: Date.now(),
          date: new Date().toISOString(),
          ...args,
          finalStock
        };
        await db.rawMaterials.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Mouvement de matière première "${args.productName}" enregistré. Stock net: ${finalStock}.`, data: record };
      }

      case "addClient": {
        const id = 'client_' + Date.now();
        const record = { id, ...args };
        await db.clients.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Client "${args.name}" enregistré avec succès.`, data: record };
      }

      case "addSupplier": {
        const id = 'supplier_' + Date.now();
        const record = { id, ...args };
        await db.suppliers.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Fournisseur "${args.name}" enregistré avec succès.`, data: record };
      }

      case "addIncome": {
        const record = {
          id: Date.now(),
          date: new Date().toISOString().split('T')[0],
          ...args
        };
        await db.income.put(record);
        try { await syncUp(); } catch {}
        return { success: true, message: `Rentrée d'argent de ${args.amount} FCFA enregistrée avec succès.`, data: record };
      }

      case "updateProduct": {
        const { productId, updates } = args;
        const product = await db.inventory.get(Number(productId));
        if (!product) return { success: false, message: `Produit ID ${productId} introuvable.` };
        const updated = { ...product, ...updates };
        await db.inventory.put(updated);
        try { await syncUp(); } catch {}
        return { success: true, message: `Produit "${updated.name}" mis à jour avec succès.`, data: updated };
      }

      case "deleteProduct": {
        const { productId } = args;
        const exists = await db.inventory.get(Number(productId));
        if (!exists) return { success: false, message: `Produit ID ${productId} introuvable.` };
        await db.inventory.delete(Number(productId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Produit "${exists.name}" supprimé définitivement.` };
      }

      case "updateEmployee": {
        const { employeeId, updates } = args;
        const rawData = await db.rhAppData.get('rh_app_data');
        const rhValue = rawData?.value || { employees: [], attendance: {}, payrollExtras: {}, visibleSundays: [] };
        const empIndex = rhValue.employees.findIndex((e: any) => e.id === Number(employeeId));
        if (empIndex === -1) return { success: false, message: `Employé ID ${employeeId} introuvable.` };
        const updated = { ...rhValue.employees[empIndex], ...updates };
        rhValue.employees[empIndex] = updated;
        await db.rhAppData.put({ key: 'rh_app_data', value: rhValue });
        try { await syncUp(); } catch {}
        return { success: true, message: `Employé ${updated.prenom} ${updated.nom} mis à jour avec succès.`, data: updated };
      }

      case "deleteEmployee": {
        const { employeeId } = args;
        const rawData = await db.rhAppData.get('rh_app_data');
        const rhValue = rawData?.value || { employees: [], attendance: {}, payrollExtras: {}, visibleSundays: [] };
        const emp = rhValue.employees.find((e: any) => e.id === Number(employeeId));
        if (!emp) return { success: false, message: `Employé ID ${employeeId} introuvable.` };
        rhValue.employees = rhValue.employees.filter((e: any) => e.id !== Number(employeeId));
        await db.rhAppData.put({ key: 'rh_app_data', value: rhValue });
        try { await syncUp(); } catch {}
        return { success: true, message: `Employé ${emp.prenom} ${emp.nom} supprimé définitivement.` };
      }

      case "updateClient": {
        const { clientId, updates } = args;
        const client = await db.clients.get(String(clientId));
        if (!client) return { success: false, message: `Client ID ${clientId} introuvable.` };
        const updated = { ...client, ...updates };
        await db.clients.put(updated);
        try { await syncUp(); } catch {}
        return { success: true, message: `Client "${updated.name}" mis à jour.`, data: updated };
      }

      case "deleteClient": {
        const { clientId } = args;
        const client = await db.clients.get(String(clientId));
        if (!client) return { success: false, message: `Client ID ${clientId} introuvable.` };
        await db.clients.delete(String(clientId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Client "${client.name}" supprimé définitivement.` };
      }

      case "updateSupplier": {
        const { supplierId, updates } = args;
        const supplier = await db.suppliers.get(String(supplierId));
        if (!supplier) return { success: false, message: `Fournisseur ID ${supplierId} introuvable.` };
        const updated = { ...supplier, ...updates };
        await db.suppliers.put(updated);
        try { await syncUp(); } catch {}
        return { success: true, message: `Fournisseur "${updated.name}" mis à jour.`, data: updated };
      }

      case "deleteSupplier": {
        const { supplierId } = args;
        const supplier = await db.suppliers.get(String(supplierId));
        if (!supplier) return { success: false, message: `Fournisseur ID ${supplierId} introuvable.` };
        await db.suppliers.delete(String(supplierId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Fournisseur "${supplier.name}" supprimé définitivement.` };
      }

      case "updateExpense": {
        const { expenseId, updates } = args;
        const expense = await db.expenses.get(Number(expenseId));
        if (!expense) return { success: false, message: `Dépense ID ${expenseId} introuvable.` };
        const updated = { ...expense, ...updates };
        await db.expenses.put(updated);
        try { await syncUp(); } catch {}
        return { success: true, message: `Dépense mise à jour.`, data: updated };
      }

      case "deleteExpense": {
        const { expenseId } = args;
        const expense = await db.expenses.get(Number(expenseId));
        if (!expense) return { success: false, message: `Dépense ID ${expenseId} introuvable.` };
        await db.expenses.delete(Number(expenseId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Dépense supprimée.` };
      }

      case "deleteSale": {
        const { saleId } = args;
        const sale = await db.dailyRecords.get(Number(saleId));
        if (!sale) return { success: false, message: `Vente ID ${saleId} introuvable.` };
        await db.dailyRecords.delete(Number(saleId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Vente annulée et supprimée de l'historique.` };
      }

      case "deleteProduction": {
        const { productionId } = args;
        const prod = await db.productions.get(Number(productionId));
        if (!prod) return { success: false, message: `Rapport de production ID ${productionId} introuvable.` };
        await db.productions.delete(Number(productionId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Rapport de production de "${prod.productName}" supprimé.` };
      }

      case "deleteRawMaterial": {
        const { rawMaterialId } = args;
        const raw = await db.rawMaterials.get(Number(rawMaterialId));
        if (!raw) return { success: false, message: `Ligne de matière première ID ${rawMaterialId} introuvable.` };
        await db.rawMaterials.delete(Number(rawMaterialId));
        try { await syncUp(); } catch {}
        return { success: true, message: `Mouvement de matière première "${raw.productName}" supprimé.` };
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
Tu as un accès complet en lecture, écriture, modification et suppression (CRUD) sur toutes les données de la base (produits, employés, absences, ventes, dépenses, clients, fournisseurs, productions, matières premières).

CONSIGNES D'ENCHAÎNEMENT D'OUTILS (CRUCIAL) :
- Pour TOUTE action de modification ou suppression sur un employé (ex: licenciement/renvoi, changement de salaire, de site ou suppression), tu DOIS d'abord appeler l'outil 'getEmployees' pour lire la liste complète et trouver son identifiant unique numérique 'id'.
- Une fois que tu as obtenu l'ID unique de l'employé à partir de son nom/prénom, appelle l'outil de modification ('updateEmployee') ou de suppression ('deleteEmployee') pour enregistrer le changement.
- N'invente jamais d'ID et ne demande pas l'ID à l'utilisateur : appelle 'getEmployees' pour le trouver toi-même !

CONSIGNE DE RECHERCHE DE NOMS :
- Dans la base de données, les noms de famille sont stockés dans le champ 'nom' (souvent en MAJUSCULES) et les prénoms dans le champ 'prenom' (ex: prenom='Nick', nom='CHAMABE' pour Nick Chamabe). Fais toujours correspondre intelligemment les noms saisis par l'utilisateur avec la liste retournée par 'getEmployees' en ignorant la casse et l'ordre (Nom Prénom ou Prénom Nom).

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

      // --- Boucle multi-tours : jusqu'à 6 appels d'outils enchaînés ---
      let loopMessages = [
        systemPrompt,
        ...history,
        { role: 'user' as const, content: userContent },
        assistantMessage,
        ...toolMessages
      ];

      let finalContent = "L'action a été réalisée avec succès.";

      for (let iteration = 0; iteration < 6; iteration++) {
        const followUpResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cachedApiKey}`
          },
          body: JSON.stringify({
            model: 'mistral-large-latest',
            messages: loopMessages,
            tools: tools,
            tool_choice: 'auto'
          })
        });

        if (!followUpResponse.ok) {
          const followUpError = await followUpResponse.json().catch(() => ({}));
          throw new Error(followUpError?.message || `Erreur lors du suivi de l'IA (Status ${followUpResponse.status})`);
        }

        const followUpData = await followUpResponse.json();
        const followUpMessage = followUpData?.choices?.[0]?.message;

        // Si le modèle veut encore appeler des outils, on les exécute et on continue
        if (followUpMessage?.tool_calls && followUpMessage.tool_calls.length > 0) {
          const nextToolMessages = [];
          for (const toolCall of followUpMessage.tool_calls) {
            const name = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments || '{}');
            const toolResult = await executeTool(name, args);

            if (name === "triggerExport" || name === "navigateToTab" || name === "generateCustomReportPDF" || name === "mergeBackupData") {
              lastActionTriggered = { name, args };
            }

            nextToolMessages.push({
              role: 'tool' as const,
              name: name,
              content: JSON.stringify(toolResult),
              tool_call_id: toolCall.id
            });
          }

          loopMessages = [
            ...loopMessages,
            { role: 'assistant' as const, content: followUpMessage.content || null, tool_calls: followUpMessage.tool_calls },
            ...nextToolMessages
          ];
          // Continuer la boucle pour donner la réponse finale à Mistral
          continue;
        }

        // Mistral a répondu sans appel d'outil : c'est la réponse finale
        finalContent = followUpMessage?.content || finalContent;
        break;
      }

      return { content: finalContent, actionTriggered: lastActionTriggered };
    }

    return { content: message?.content || "Désolé, je n'ai pas pu formuler de réponse." };
  } catch (error: any) {
    console.error('[IA Copilot] Erreur d\'appel API :', error);
    throw new Error(error?.message || "Erreur de connexion avec l'IA.");
  }
};

/**
 * Génère de l'audio à partir d'un texte via l'API Mistral Voxtral (voix Marie)
 * et retourne un Object URL pointant vers le Blob audio.
 */
export const getMistralTTSAudio = async (text: string): Promise<string> => {
  if (!cachedApiKey) {
    const initialized = await initializeMistral();
    if (!initialized || !cachedApiKey) {
      throw new Error("L'assistant IA n'est pas initialisé ou la clé API est absente.");
    }
  }

  const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cachedApiKey}`
    },
    body: JSON.stringify({
      model: 'voxtral-mini-tts-latest',
      input: text,
      voice_id: 'fr_marie_neutral',
      response_format: 'mp3'
    })
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.message || `Erreur TTS Mistral (Status ${response.status})`);
  }

  if (contentType.includes('application/json')) {
    const jsonData = await response.json();
    if (jsonData && jsonData.audio_data) {
      return `data:audio/mp3;base64,${jsonData.audio_data}`;
    } else {
      throw new Error(jsonData?.message || "Aucune donnée audio retournée dans le JSON de Mistral TTS.");
    }
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
};
