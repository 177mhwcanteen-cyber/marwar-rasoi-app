/* मारवाड़ रसोई — सेटिंग (गुप्त नहीं; डेटा की सुरक्षा firestore.rules से)
   firebase.projectId खाली हो तो ऐप "डेमो मोड" में चलता है (टेस्ट इसी से चलते हैं)। 13-11-2026: विक्रम जी का प्रोजेक्ट marwar-rasoi-24d56 जुड़ा। */
window.MR_CONFIG = {
  org: "rasoi", // 🏢 संस्था — कभी न बदलें (177 = "mh177", भैरव = "bhairav")
  firebase: { apiKey: "AIzaSyBRBI02RqhoNztujaI46xajEOu7ETguE4U", authDomain: "marwar-rasoi-24d56.firebaseapp.com", projectId: "marwar-rasoi-24d56", storageBucket: "marwar-rasoi-24d56.firebasestorage.app", messagingSenderId: "590704192333", appId: "1:590704192333:web:f19b44534dd3a4dcd2a504" },
  shop: "Marwar Rasoi", place: "Amenity Centre, Jalipa",
  tables: 16,
  manager: { name: "स्वरूप सा", phone: "9166753417" },
  ownerWait: 180, // सेकंड — मैनेजर इतनी देर में स्वीकार न करे तो मालिक को घंटी
  // ⏰ ग्राहक के ऑर्डर का समय (विक्रम जी, 13-11-2026): रात 10:30 से सुबह 8:00 तक कोई ऑर्डर नहीं; बाकी समय हर कोई ऑर्डर कर सके (रसोई बंद हो तब भी — फोन पर समझा देंगे)
  orderFrom: "08:00", orderTo: "22:30", hurryFrom: "21:00", // 9 बजे के बाद: "जल्दी ऑर्डर करें"
  lunch: ["11:30", "14:30"], dinner: ["19:15", "22:30"], eveFrom: "17:00", // शाम 5 के बाद: "रसोई 7:15 पर शुरू — सबसे पहले आपका ऑर्डर"
  prep: [15, 25, 35, 45], // स्वीकार करते समय "कितने मिनट में तैयार"
  base: "https://177mhwcanteen-cyber.github.io/marwar-rasoi-app/"
};
