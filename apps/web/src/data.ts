export type Role = "doctor" | "nurse" | "admin" | "onboarding";

export const patients = [
  { token: "A-11", name: "Sunil M.", id: "OPD-26-0831", context: "Cycle 6 review", papers: "Complete", time: "09:20", state: "Arrived" },
  { token: "A-12", name: "Asha K.", id: "OPD-26-0877", context: "Cycle 5 review", papers: "Echo report missing", time: "09:40", state: "Waiting" },
  { token: "A-15", name: "Farida B.", id: "OPD-26-0904", context: "Post-surgery day 12", papers: "Complete", time: "10:00", state: "Waiting" },
  { token: "A-17", name: "Meena D.", id: "OPD-26-0917", context: "Cycle 4 · breast oncology", papers: "CBC filed 08:52", time: "10:10", state: "Ready" },
  { token: "A-18", name: "Ramesh P.", id: "OPD-26-0938", context: "Cycle 2 review", papers: "Photo needs match", time: "10:30", state: "Exception" }
];

export const careEvents = [
  { date: "24 Sep · 08:52", title: "CBC report filed", detail: "Original 2-page report verified by records clerk Kavita.", source: "Scanned paper", tone: "verified" },
  { date: "24 Sep · 08:31", title: "Pathology appointment completed", detail: "Token A-17 · District Hospital Pathology Lab.", source: "OpenMRS scheduler", tone: "verified" },
  { date: "22 Sep · 17:44", title: "Family reminder delivered", detail: "Hindi utility template · Meta message …9f02 · read 18:06.", source: "WhatsApp Cloud", tone: "channel" },
  { date: "21 Sep · 10:51", title: "Six-month pathway signed", detail: "Dr S. Kulkarni · version 3 · passkey verified.", source: "SUTRA signature", tone: "signed" },
  { date: "20 Sep · 16:03", title: "Caregiver consent recorded", detail: "Ravi D. linked for appointments, plan lines and report upload.", source: "OPD desk", tone: "neutral" },
  { date: "18 Sep · 11:20", title: "Modified radical mastectomy", detail: "Discharge summary received through ABDM consent.", source: "ABDM · City Hospital", tone: "neutral" },
  { date: "Mar–Jul 2026", title: "Three prior chemotherapy cycles", detail: "Encounter records remain in the OpenMRS clinical record.", source: "OpenMRS", tone: "neutral" }
];

export const pathway = [
  { title: "Surgery · modified radical mastectomy", when: "Completed 18 Sep", owner: "Surgery", state: "done" },
  { title: "Cycle 4 · day-care chair", when: "25 Sep · 09:00", owner: "Oncology day care", state: "next" },
  { title: "CBC before cycle 5", when: "Window 20–22 Oct", owner: "Pathology", state: "planned" },
  { title: "Cycle 5", when: "Window 23–25 Oct", owner: "Oncology day care", state: "planned" },
  { title: "Echo before cycle 6", when: "Window 17–19 Nov", owner: "Cardiology", state: "planned" },
  { title: "Cycle 6", when: "Window 20–22 Nov", owner: "Oncology day care", state: "planned" },
  { title: "Radiotherapy referral", when: "Within 3 months", owner: "Radiotherapy", state: "planned" },
  { title: "Follow-up", when: "3 months after RT", owner: "Oncology OPD", state: "planned" }
];

export const inbox = [
  { id: "CW-845", patient: "Meena D.", text: "मीना को बुखार है", translation: "Meena has fever", tag: "Clinical or unknown", confidence: "deferred", route: "Nurse callback", age: "4 min", tone: "coral" },
  { id: "CW-844", patient: "Ramesh P.", text: "सांस नहीं आ रही", translation: "Cannot breathe", tag: "Exact urgent phrase match", confidence: "Rule ONC-MSG-04", route: "Nurse immediate", age: "1 min", tone: "red" },
  { id: "CW-841", patient: "Asha K.", text: "मेरी echo booking कब है?", translation: "When is my echo booking?", tag: "Scheduling", confidence: "0.94", route: "Scheduling desk", age: "17 min", tone: "blue" },
  { id: "CW-837", patient: "Farida B.", text: "रिपोर्ट फिर भेजनी है", translation: "Need to send report again", tag: "Records", confidence: "0.89", route: "Records desk", age: "32 min", tone: "blue" }
];

export const auditEvents = [
  ["24 Sep 08:52", "REPORT_FILED", "records-kavita", "Scanned paper", "evt_8f21"],
  ["24 Sep 08:31", "APPOINTMENT_COMPLETED", "openmrs-system", "OpenMRS", "apt_c131"],
  ["22 Sep 18:06", "WHATSAPP_READ", "external", "WhatsApp Cloud", "wamid…9f02"],
  ["21 Sep 10:51", "PATHWAY_SIGNED", "dr-kulkarni", "SUTRA", "sig_41ad"],
  ["20 Sep 16:03", "CAREGIVER_CONSENT", "clerk-nisha", "OPD desk", "con_33be"]
];
