/* मारवाड़ रसोई — सेटिंग (गुप्त नहीं; डेटा की सुरक्षा firestore.rules से)
   firebase.projectId खाली है तब तक ऐप "डेमो मोड" में चलता है — डेटा सिर्फ़ इसी फोन/ब्राउज़र में। */
window.MR_CONFIG = {
  org: "rasoi", // 🏢 संस्था — कभी न बदलें (177 = "mh177", भैरव = "bhairav")
  firebase: { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" },
  shop: "Marwar Rasoi", place: "Amenity Centre, Jalipa",
  tables: 16,
  manager: { name: "स्वरूप सा", phone: "9166753417" },
  ownerWait: 180, // सेकंड — मैनेजर इतनी देर में स्वीकार न करे तो मालिक को घंटी
  prep: [15, 25, 35, 45], // स्वीकार करते समय "कितने मिनट में तैयार"
  base: "https://177mhwcanteen-cyber.github.io/marwar-rasoi-app/"
};
