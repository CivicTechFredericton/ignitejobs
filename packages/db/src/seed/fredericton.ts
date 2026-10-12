// Seed data for the Fredericton Capital Region deployment (Ignite).
// Other workforce bodies copy this file and adapt it to their region.
import type { LocalizedText } from "../schema.ts";

type Term = { slug: string; name: LocalizedText };

export const site = {
  name: { en: "Ignite Job Board", fr: "Babillard d'emplois Ignite" },
  region: { en: "Fredericton Capital Region", fr: "Région de la capitale de Fredericton" },
  defaultLocale: "en",
  locales: ["en", "fr"],
  // Served from apps/web/public/branding; replace the file for another deployment.
  branding: { logoUrl: "/branding/logo.png" },
};

export const locations: (Term & { aliases?: string[] })[] = [
  { slug: "fredericton", name: { en: "Fredericton", fr: "Fredericton" } },
  { slug: "oromocto", name: { en: "Oromocto", fr: "Oromocto" } },
  { slug: "hanwell", name: { en: "Hanwell", fr: "Hanwell" } },
  { slug: "new-maryland", name: { en: "New Maryland", fr: "New Maryland" } },
  { slug: "lincoln", name: { en: "Lincoln", fr: "Lincoln" } },
  { slug: "grand-lake", name: { en: "Grand Lake", fr: "Grand Lake" }, aliases: ["minto", "chipman"] },
  { slug: "nackawic-millville", name: { en: "Nackawic-Millville", fr: "Nackawic-Millville" }, aliases: ["nackawic"] },
  { slug: "woodstock", name: { en: "Woodstock", fr: "Woodstock" } },
  { slug: "remote", name: { en: "Remote", fr: "À distance" }, aliases: ["remote", "work from home", "télétravail"] },
  { slug: "multiple", name: { en: "Multiple locations", fr: "Plusieurs emplacements" }, aliases: ["multiple", "various"] },
];

export const industries: Term[] = [
  { slug: "aerospace-defence", name: { en: "Aerospace & Defence", fr: "Aérospatiale et défense" } },
  { slug: "armed-forces", name: { en: "Armed Forces", fr: "Forces armées" } },
  { slug: "automotive", name: { en: "Automotive", fr: "Automobile" } },
  { slug: "construction", name: { en: "Construction", fr: "Construction" } },
  { slug: "consulting", name: { en: "Business Consulting", fr: "Services-conseils aux entreprises" } },
  { slug: "economic-development", name: { en: "Economic Development", fr: "Développement économique" } },
  { slug: "education", name: { en: "Education", fr: "Éducation" } },
  { slug: "energy-utilities", name: { en: "Energy & Utilities", fr: "Énergie et services publics" } },
  { slug: "engineering", name: { en: "Engineering", fr: "Ingénierie" } },
  { slug: "environmental-services", name: { en: "Environmental Services", fr: "Services environnementaux" } },
  { slug: "financial-services", name: { en: "Financial Services", fr: "Services financiers" } },
  { slug: "food-service", name: { en: "Food Service", fr: "Services alimentaires" } },
  { slug: "government", name: { en: "Government", fr: "Gouvernement" } },
  { slug: "healthcare", name: { en: "Healthcare", fr: "Soins de santé" } },
  { slug: "hospitality", name: { en: "Hospitality", fr: "Hôtellerie et tourisme" } },
  { slug: "information-technology", name: { en: "Information Technology", fr: "Technologies de l'information" } },
  { slug: "insurance", name: { en: "Insurance", fr: "Assurances" } },
  { slug: "logistics", name: { en: "Logistics & Transportation", fr: "Logistique et transport" } },
  { slug: "manufacturing", name: { en: "Manufacturing", fr: "Fabrication" } },
  { slug: "marketing-sales", name: { en: "Marketing & Sales", fr: "Marketing et ventes" } },
  { slug: "non-profit", name: { en: "Non-profit", fr: "Organisme sans but lucratif" } },
  { slug: "real-estate", name: { en: "Real Estate & Investment", fr: "Immobilier et investissement" } },
  { slug: "recruitment", name: { en: "Recruitment & Staffing", fr: "Recrutement et placement" } },
  { slug: "research", name: { en: "Research & Technology", fr: "Recherche et technologie" } },
  { slug: "retail", name: { en: "Retail", fr: "Commerce de détail" } },
  { slug: "multiple", name: { en: "Multiple", fr: "Plusieurs" } },
  { slug: "other", name: { en: "Other", fr: "Autre" } },
];

export const jobTypes: Term[] = [
  { slug: "administration", name: { en: "Administration", fr: "Administration" } },
  { slug: "customer-service", name: { en: "Customer Service", fr: "Service à la clientèle" } },
  { slug: "education-training", name: { en: "Education & Training", fr: "Enseignement et formation" } },
  { slug: "engineering", name: { en: "Engineering", fr: "Ingénierie" } },
  { slug: "finance-accounting", name: { en: "Finance & Accounting", fr: "Finance et comptabilité" } },
  { slug: "healthcare", name: { en: "Healthcare", fr: "Soins de santé" } },
  { slug: "human-resources", name: { en: "Human Resources", fr: "Ressources humaines" } },
  { slug: "information-technology", name: { en: "Information Technology", fr: "Technologies de l'information" } },
  { slug: "labour", name: { en: "General Labour", fr: "Main-d'œuvre" } },
  { slug: "legal", name: { en: "Legal", fr: "Juridique" } },
  { slug: "management", name: { en: "Management", fr: "Gestion" } },
  { slug: "marketing-communications", name: { en: "Marketing & Communications", fr: "Marketing et communications" } },
  { slug: "project-management", name: { en: "Project Management", fr: "Gestion de projets" } },
  { slug: "sales", name: { en: "Sales", fr: "Ventes" } },
  { slug: "skilled-trades", name: { en: "Skilled Trades & Technical", fr: "Métiers spécialisés et techniques" } },
  { slug: "social-services", name: { en: "Social & Community Services", fr: "Services sociaux et communautaires" } },
  { slug: "multiple", name: { en: "Multiple", fr: "Plusieurs" } },
  { slug: "other", name: { en: "Other", fr: "Autre" } },
];
