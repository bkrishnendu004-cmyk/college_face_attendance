// EmailJS: Public Key only. The Private Key must never be placed in frontend code.
const SERVICE_ID = "service_6agpi3k", TEMPLATE_ID = "template_skoug4p", PUBLIC_KEY = "gnl6nXbGuXI17K7TY";
export async function sendAttendanceEmail(data) {
  if (!window.emailjs) throw new Error("EmailJS library not loaded");
  emailjs.init({ publicKey: PUBLIC_KEY });
  return emailjs.send(SERVICE_ID, TEMPLATE_ID, data); // data includes room, class_name, teacher_name, date, time, ...
}
