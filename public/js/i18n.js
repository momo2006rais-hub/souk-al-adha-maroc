const dict = {
  fr: {
    brand: "Souk Al-Adha Maroc",
    search: "Rechercher…",
    category: "Catégorie",
    city: "Ville",
    all: "Tout",
    cart: "Panier",
    heroTitle: "Achetez vos animaux pour Aid Al-Adha et pour l’élevage",
    heroText: "Commande simple, prix transparents, livraison selon disponibilité. Paiement à la livraison possible.",
    ctaAid: "Aid Al-Adha",
    ctaFarm: "Pour Éleveurs",
    kpi1n: "WhatsApp",
    kpi1t: "Commande rapide",
    kpi2n: "SQLite",
    kpi2t: "Ordres enregistrés",
    kpi3n: "FR / AR",
    kpi3t: "Bilingue",
    kpi4n: "MAD",
    kpi4t: "Prix clairs",
    productsTitle: "Animaux disponibles",
    productsHint: "Sélectionnez une catégorie et une ville.",
    addToCart: "Ajouter",
    view: "Voir",
    certified: "Certifié",
    delivery: "Livraison",
    weight: "Poids",
    age: "Âge",
    months: "mois",
    checkout: "Commander",
    name: "Nom",
    phone: "Téléphone",
    address: "Adresse",
    notes: "Notes",
    submitOrder: "Valider la commande",
    openWhatsApp: "Ouvrir WhatsApp",
    emptyCart: "Panier vide",
    admin: "Admin",
    adminPassword: "Mot de passe admin",
    loadOrders: "Charger les commandes",
    total: "Total",
    qty: "Qté"
  },
  ar: {
    brand: "سوق الأضحى المغرب",
    search: "ابحث…",
    category: "الفئة",
    city: "المدينة",
    all: "الكل",
    cart: "السلة",
    heroTitle: "شراء الحيوانات لعيد الأضحى وللتربية",
    heroText: "طلب سهل، أسعار واضحة، التوصيل حسب التوفر. الدفع عند الاستلام ممكن.",
    ctaAid: "عيد الأضحى",
    ctaFarm: "للمربين",
    kpi1n: "واتساب",
    kpi1t: "طلب سريع",
    kpi2n: "قاعدة بيانات",
    kpi2t: "حفظ الطلبات",
    kpi3n: "FR / AR",
    kpi3t: "لغتان",
    kpi4n: "درهم",
    kpi4t: "أسعار واضحة",
    productsTitle: "حيوانات متوفرة",
    productsHint: "اختر الفئة والمدينة.",
    addToCart: "أضف",
    view: "عرض",
    certified: "موثّق",
    delivery: "توصيل",
    weight: "الوزن",
    age: "العمر",
    months: "شهر",
    checkout: "إتمام الطلب",
    name: "الاسم",
    phone: "الهاتف",
    address: "العنوان",
    notes: "ملاحظات",
    submitOrder: "تأكيد الطلب",
    openWhatsApp: "فتح واتساب",
    emptyCart: "السلة فارغة",
    admin: "إدارة",
    adminPassword: "كلمة مرور الإدارة",
    loadOrders: "تحميل الطلبات",
    total: "المجموع",
    qty: "الكمية"
  }
};

export function getLang() {
  const saved = localStorage.getItem("lang");
  return saved === "ar" ? "ar" : "fr";
}

export function setLang(lang) {
  localStorage.setItem("lang", lang === "ar" ? "ar" : "fr");
}

export function t(key) {
  const lang = getLang();
  return dict[lang][key] ?? key;
}

export function applyLangToDocument() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.body.classList.toggle("rtl", lang === "ar");

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    el.textContent = t(k);
  });

  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const k = el.getAttribute("data-i18n-ph");
    el.setAttribute("placeholder", t(k));
  });
}
