/* मारवाड़ रसोई — सेटिंग (गुप्त नहीं; डेटा की सुरक्षा firestore.rules से)
   firebase.projectId खाली है तब तक ऐप "डेमो मोड" में चलता है — डेटा सिर्फ़ इसी फोन/ब्राउज़र में। */
window.MR_CONFIG = {
  org: "rasoi", // 🏢 संस्था — कभी न बदलें (177 = "mh177", भैरव = "bhairav")
  firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
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
