import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import Feather from "@expo/vector-icons/Feather";
import * as DocumentPicker from "expo-document-picker";
import { useEffect, useRef, useState } from "react";
import {
  Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput,
  useWindowDimensions, View, type StyleProp, type ViewStyle
} from "react-native";
import { auditEvents, careEvents, inbox, pathway, patients, type Role } from "./src/data";
import { api, ApiError, type CarePlanDraft, type CareStep, type DocumentResponse, type EventRecord, type IntegrationResults, type OnboardingState, type PatientLifecycle, type PatientThread as PatientThreadData, type PrescriptionDraft, type Principal, type RouteDecision, type TranscriptResponse, type WorkItem } from "./src/api";
import { beginLogin } from "./src/auth";
import { SutraMark } from "./src/SutraMark";

const DEMO_MODE = Constants.expoConfig?.extra?.demoMode === true;

type ScreenId = "today" | "patient" | "lifecycle" | "dictation" | "plan" | "prescription" | "appointment" | "records" | "routing" | "analytics" | "integrations" | "audit" | "onboarding";
type IconName = React.ComponentProps<typeof Feather>["name"];
type NavItem = { id: ScreenId; label: string; icon: IconName };

const C = {
  navy: "#151C3B", navy2: "#222B50", coral: "#F25749", paper: "#FBF8F2",
  white: "#FFFFFF", ink: "#202743", muted: "#6F7588", line: "#DDDAD2",
  pale: "#F1EFE9", blue: "#E8F1FF", blueInk: "#315B96", mint: "#DDF1E6",
  green: "#24704A", amber: "#9A5A00", amberPale: "#FFF0D8", red: "#B42318", redPale: "#FCE8E6"
};

function Brand({ subtitle }: { subtitle: string }) {
  return <View style={s.brand}><View style={s.brandImage}><SutraMark width={40} height={30} /></View><View><Text style={s.brandName}>SUTRA</Text><Text style={s.brandSub}>{subtitle}</Text></View></View>;
}

const roleNames: Record<Role, string> = {
  doctor: "Doctor", nurse: "Nurse / Records", admin: "Admin / Analyst", onboarding: "Hospital onboarding"
};
const nav: Record<Role, NavItem[]> = {
  doctor: [
    { id: "today", label: "Today", icon: "calendar" }, { id: "patient", label: "Patient thread", icon: "activity" },
    { id: "dictation", label: "Dictation", icon: "mic" }, { id: "plan", label: "Care plan", icon: "list" },
    { id: "prescription", label: "Prescription", icon: "edit-3" }
  ],
  nurse: [
    { id: "today", label: "Today", icon: "calendar" }, { id: "records", label: "OCR review", icon: "file-text" },
    { id: "routing", label: "Routing inbox", icon: "inbox" }, { id: "patient", label: "Patient thread", icon: "user-check" }
  ],
  admin: [
    { id: "analytics", label: "Follow-through", icon: "bar-chart-2" }, { id: "integrations", label: "Integrations", icon: "git-merge" },
    { id: "audit", label: "Audit trail", icon: "shield" }
  ],
  onboarding: [
    { id: "onboarding", label: "Go-live gates", icon: "check-square" }, { id: "integrations", label: "Connections", icon: "link-2" },
    { id: "audit", label: "Runbook", icon: "book-open" }
  ]
};

function Icon({ name, size = 18, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}
function Dot({ tone = "ok" }: { tone?: "ok" | "warn" | "bad" }) {
  return <View style={[s.dot, tone === "warn" && s.dotWarn, tone === "bad" && s.dotBad]} />;
}
/** React Native Web reports keyboard focus to Pressable style callbacks; native platforms ignore it. */
function focusRing(state: { pressed: boolean }): StyleProp<ViewStyle> {
  return (state as { focused?: boolean }).focused ? s.focusRing : null;
}
function Button({ children, onPress, tone = "primary", icon, disabled, busy, expanded, accessibilityLabel, style }: { children: React.ReactNode; onPress?: () => void; tone?: "primary" | "secondary" | "quiet"; icon?: IconName; disabled?: boolean; busy?: boolean; expanded?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled, busy: !!busy, expanded }} disabled={disabled} onPress={onPress} style={state => [s.button, tone === "secondary" && s.buttonSecondary, tone === "quiet" && s.buttonQuiet, disabled && s.disabled, state.pressed && !disabled && { opacity: .8 }, focusRing(state), style]}>
    {icon && <Icon name={icon} size={16} color={tone === "primary" ? C.white : C.navy} />}<Text style={[s.buttonText, tone !== "primary" && s.buttonTextDark]}>{children}</Text>
  </Pressable>;
}
function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "blue" }) {
  return <View style={[s.chip, tone === "good" && s.chipGood, tone === "warn" && s.chipWarn, tone === "bad" && s.chipBad, tone === "blue" && s.chipBlue]}><Text style={[s.chipText, tone === "good" && { color: C.green }, tone === "warn" && { color: C.amber }, tone === "bad" && { color: C.red }, tone === "blue" && { color: C.blueInk }]}>{children}</Text></View>;
}
function SectionTitle({ kicker, title, copy, action }: { kicker: string; title: string; copy?: string; action?: React.ReactNode }) {
  const compact = useWindowDimensions().width < 650;
  return <View style={[s.sectionTitle, compact && { flexDirection: "column" }]}><View style={[s.sectionTitleCopy, compact && { width: "100%" }]}><Text style={s.kicker}>{kicker}</Text><Text accessibilityRole="header" style={[s.pageTitle, compact && { fontSize: 30, lineHeight: 35 }]}>{title}</Text>{copy && <Text style={s.lead}>{copy}</Text>}</View>{action && <View>{action}</View>}</View>;
}
function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) { return <View style={[s.card, style]}>{children}</View>; }
function Avatar({ letters, coral = false }: { letters: string; coral?: boolean }) { return <View style={[s.avatar, coral && s.avatarCoral]}><Text style={[s.avatarText, coral && { color: C.white }]}>{letters}</Text></View>; }

function DemoApp() {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [role, setRole] = useState<Role>("doctor");
  const [screen, setScreen] = useState<ScreenId>("today");
  const [showRoles, setShowRoles] = useState(false);
  const switchRole = (next: Role) => { setRole(next); setScreen(nav[next][0].id); setShowRoles(false); };
  return <SafeAreaView style={s.safe}><StatusBar style={compact ? "dark" : "light"} />
    <View style={[s.shell, compact && s.shellCompact]}>
      <View style={[s.sidebar, compact && s.mobileHeader]}>
        <Brand subtitle="care follow-through" />
        {!compact && <View style={s.demoFlag}><Text style={s.demoFlagText}>DEMO PREVIEW</Text><Text style={s.demoFlagSub}>Synthetic patients only</Text></View>}
        {!compact && <View style={s.nav}>{nav[role].map(item => <Pressable key={item.id} onPress={() => setScreen(item.id)} style={[s.navItem, screen === item.id && s.navActive]} accessibilityState={{ selected: screen === item.id }}><Icon name={item.icon} color={screen === item.id ? C.navy : "#BAC0D0"} /><Text style={[s.navText, screen === item.id && s.navTextActive]}>{item.label}</Text></Pressable>)}</View>}
        {DEMO_MODE && <View style={[s.roleWrap, compact && { marginLeft: "auto", marginTop: 0 }]}>
          <Pressable onPress={() => setShowRoles(v => !v)} style={s.roleButton} accessibilityLabel={`Preview role: ${roleNames[role]}`} accessibilityState={{ expanded: showRoles }}><Avatar letters={role === "doctor" ? "SK" : role === "nurse" ? "NP" : role === "admin" ? "AR" : "IT"} coral /><View style={{ flex: 1 }}><Text style={s.roleSmall}>PREVIEWING ROLE</Text><Text style={s.roleName}>{roleNames[role]}</Text></View><Icon name="chevron-down" color={C.white} /></Pressable>
          {showRoles && <View style={[s.roleMenu, compact && s.roleMenuMobile]}>{(Object.keys(roleNames) as Role[]).map(r => <Pressable key={r} onPress={() => switchRole(r)} style={s.roleMenuItem}><Text style={s.roleMenuText}>{roleNames[r]}</Text>{r === role && <Icon name="check" color={C.coral} />}</Pressable>)}</View>}
        </View>}
      </View>
      <View style={s.main}>
        {compact && <ScrollView horizontal style={s.mobileNavScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={s.mobileNav}>{nav[role].map(item => <Pressable key={item.id} onPress={() => setScreen(item.id)} style={[s.mobileNavItem, screen === item.id && s.mobileNavActive]}><Icon name={item.icon} size={16} color={screen === item.id ? C.navy : C.muted} /><Text style={[s.mobileNavText, screen === item.id && { color: C.navy }]}>{item.label}</Text></Pressable>)}</ScrollView>}
        {!compact && <View style={s.topbar}><Text style={s.topbarText}>District Hospital · Oncology</Text><View style={s.health}><Text style={s.healthItem}><Dot /> OpenMRS</Text><Text style={s.healthItem}><Dot /> Scheduler</Text><Text style={s.healthItem}><Dot tone="warn" /> WhatsApp</Text></View></View>}
        <ScrollView style={s.scroll} contentContainerStyle={[s.content, compact && s.contentCompact]}>
          {screen === "today" && <Today role={role} go={setScreen} compact={compact} />}
          {screen === "patient" && <PatientThread go={setScreen} compact={compact} />}
          {screen === "dictation" && <Dictation compact={compact} />}
          {screen === "plan" && <CarePlan compact={compact} />}
          {screen === "prescription" && <Prescription compact={compact} />}
          {screen === "records" && <OcrReview compact={compact} />}
          {screen === "routing" && <RoutingInbox compact={compact} />}
          {screen === "analytics" && <Analytics compact={compact} />}
          {screen === "integrations" && <Integrations compact={compact} />}
          {screen === "audit" && <AuditTrail compact={compact} />}
          {screen === "onboarding" && <Onboarding compact={compact} />}
        </ScrollView>
      </View>
    </View>
  </SafeAreaView>;
}

export default function App() {
  return DEMO_MODE ? <DemoApp /> : <LiveApp />;
}

type LiveActionState = { busy: boolean; error?: string; offline?: boolean; success?: string };

function errorState(error: unknown): LiveActionState {
  return { busy: false, error: error instanceof Error ? error.message : "The request failed.", offline: error instanceof ApiError && error.offline };
}

function LiveApp() {
  const { width } = useWindowDimensions();
  const compact = width < 900;
  const [screen, setScreen] = useState<ScreenId>("today");
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationResults>({});
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [thread, setThread] = useState<PatientThreadData | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [load, setLoad] = useState<LiveActionState>({ busy: true });
  const [search, setSearch] = useState<LiveActionState>({ busy: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollTop = () => scrollRef.current?.scrollTo({ y: 0, animated: false });
  const go = (next: ScreenId) => { setScreen(next); setMenuOpen(false); scrollTop(); };
  useEffect(() => {
    if (Platform.OS !== "web" || !menuOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);

  const refresh = async () => {
    setLoad({ busy: true });
    try {
      const [me, probes, state] = await Promise.all([api.me(), api.integrations(), api.onboarding()]);
      if (!principal && (me.Roles ?? []).includes("doctor")) setScreen("lifecycle");
      setPrincipal(me); setIntegrations(probes); setOnboarding(state); setLoad({ busy: false });
    } catch (error) { setLoad(errorState(error)); }
  };
  useEffect(() => { void refresh(); }, []);

  const exactSearch = async () => {
    if (!identifier.trim()) return;
    setSearch({ busy: true });
    try { const result = await api.patientThread(identifier.trim()); setThread(result); go("patient"); setSearch({ busy: false }); }
    catch (error) { setThread(null); setSearch(errorState(error)); }
  };

  if (load.busy) return <LiveState title="Connecting to the hospital boundary…" copy="Reading identity, integration probes and onboarding state from the SUTRA API." icon="loader" />;
  if (load.error || !principal) return <LiveState title={load.offline ? "Hospital API is offline" : "A hospital session is required"} copy={load.error ?? "Sign in through the hospital identity provider."} icon={load.offline ? "wifi-off" : "lock"} action={<><Button onPress={() => void refresh()} tone="secondary" icon="refresh-cw">Retry</Button>{!load.offline && <Button onPress={() => void beginLogin()} icon="log-in">Sign in</Button>}</>} />;

  const roles = principal.Roles ?? [];
  const doctor = roles.includes("doctor");
  const records = doctor || roles.includes("nurse") || roles.includes("records_clerk");
  const admin = roles.includes("admin") || roles.includes("clinical_lead");
  const liveNav: NavItem[] = [
    { id: "today", label: "Hospital status", icon: "home" },
    { id: "patient", label: "Patient thread", icon: "activity" },
    { id: "lifecycle", label: "Patient lifecycle", icon: "git-commit" },
    ...(doctor ? [{ id: "dictation", label: "Dictation", icon: "mic" }, { id: "plan", label: "Care plan", icon: "list" }, { id: "prescription", label: "Prescription", icon: "edit-3" }, { id: "appointment", label: "Appointment", icon: "calendar" }] as NavItem[] : []),
    ...(records ? [{ id: "records", label: "Documents", icon: "file-text" }, { id: "routing", label: "Route message", icon: "inbox" }] as NavItem[] : []),
    ...(admin ? [{ id: "integrations", label: "Integrations", icon: "git-merge" }, { id: "onboarding", label: "Onboarding", icon: "check-square" }] as NavItem[] : []),
    { id: "audit", label: "Patient events", icon: "shield" }
  ];
  const apiAvailable = !load.offline;
  const schedulerAvailable = Object.values(integrations).some(p => p.reachable && p.manifest.capabilities.includes("appointment.write"));
  const currentRole = roles.join(", ") || "no role claim";
  const patientRef = thread?.patient.reference.id ?? "";
  const current = liveNav.find(item => item.id === screen) ?? liveNav[0];
  const sourcesOnline = `${Object.values(integrations).filter(x => x.reachable).length}/${Object.keys(integrations).length} sources online`;
  const sourcesTone = Object.values(integrations).some(x => !x.reachable) ? "warn" as const : "ok" as const;
  const searchBox = <LiveSearch value={identifier} setValue={setIdentifier} run={exactSearch} state={search} compact={compact} />;

  return <SafeAreaView style={s.safe}><StatusBar style={compact ? "dark" : "light"} /><View style={[s.shell, compact && s.shellCompact]}>
    <View style={[s.sidebar, compact && s.mobileHeader]}>
      <Brand subtitle="hospital workspace" />
      {!compact && <View style={s.liveFlag}><Text style={s.liveFlagTitle}>LIVE HOSPITAL DATA</Text><Text style={s.liveFlagText}>{onboarding?.hospitalName ?? principal.TenantID}</Text></View>}
      {!compact && <View style={s.nav} accessibilityRole="menu">{liveNav.map(item => <Pressable key={item.id} accessibilityRole="menuitem" accessibilityState={{ selected: screen === item.id }} onPress={() => go(item.id)} style={state => [s.navItem, screen === item.id && s.navActive, focusRing(state)]}><Icon name={item.icon} color={screen === item.id ? C.navy : "#BAC0D0"} /><Text style={[s.navText, screen === item.id && s.navTextActive]}>{item.label}</Text></Pressable>)}</View>}
      {!compact && <View style={s.liveIdentity}><Avatar letters={principal.Subject.slice(0, 2).toUpperCase()} coral /><View style={{ flex: 1 }}><Text style={s.roleSmall}>AUTHENTICATED</Text><Text style={s.roleName}>{currentRole}</Text><Text style={s.liveTenant} numberOfLines={1}>{principal.ProviderOrgID || principal.TenantID}</Text></View></View>}
      {compact && <Pressable accessibilityRole="button" accessibilityLabel={`Menu. Current section: ${current.label}`} aria-expanded={menuOpen} onPress={() => setMenuOpen(v => !v)} style={state => [s.menuButton, focusRing(state)]}>
        <Text style={s.menuButtonText} numberOfLines={1}>{current.label}</Text><Icon name={menuOpen ? "x" : "menu"} color={C.white} />
      </Pressable>}
    </View>
    {compact && menuOpen && <View role="navigation" aria-label="Workspace sections" style={s.mobileMenu}>
      <View style={s.mobileMenuGrid}>{liveNav.map(item => {
        const active = screen === item.id;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={active ? `${item.label}, current section` : item.label} onPress={() => go(item.id)} style={state => [s.mobileMenuItem, active && s.mobileMenuItemActive, focusRing(state)]}>
          <Icon name={item.icon} size={16} color={active ? C.coral : C.navy} /><Text style={[s.mobileMenuText, active && { color: C.coral }]} numberOfLines={1}>{item.label}</Text>
        </Pressable>;
      })}</View>
      <View style={s.mobileMenuFoot}><Text style={s.rowSmall} numberOfLines={1}>Signed in as <Text style={s.bold}>{currentRole}</Text> · {onboarding?.hospitalName ?? principal.TenantID}</Text><View style={s.iconLine}><Dot tone={sourcesTone} /><Text style={s.rowSmall}>{sourcesOnline}</Text></View></View>
    </View>}
    <View style={s.main}>
      {!compact && <View style={s.topbar}><Text style={s.topbarText} numberOfLines={1}>{onboarding?.hospitalName ?? "Hospital tenant"}</Text><View style={s.topbarSearch}>{searchBox}</View><View style={s.health}><Text style={s.healthItem}><Dot tone={sourcesTone} /> {sourcesOnline}</Text></View></View>}
      <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={[s.content, compact && s.contentCompact]}>
        {compact && <View style={{ marginBottom: 18 }}>{searchBox}</View>}
        {search.error && <View accessibilityLiveRegion="polite"><ActionError state={search} /></View>}
        {screen === "today" && <LiveHome principal={principal} onboarding={onboarding} integrations={integrations} />}
        {screen === "patient" && <LivePatient thread={thread} go={go} doctor={doctor} />}
        {screen === "lifecycle" && <LiveLifecycle principal={principal} compact={compact} scrollTop={scrollTop} />}
        {screen === "dictation" && <LiveDictation patientRef={patientRef} enabled={doctor && apiAvailable} />}
        {screen === "plan" && <LiveCarePlan patientRef={patientRef} enabled={doctor && apiAvailable} />}
        {screen === "prescription" && <LivePrescription patientRef={patientRef} enabled={doctor && apiAvailable} />}
        {screen === "appointment" && <LiveAppointment thread={thread} enabled={doctor && apiAvailable && schedulerAvailable} />}
        {screen === "records" && <LiveDocuments patientRef={patientRef} enabled={records && apiAvailable} />}
        {screen === "routing" && <LiveRouting patientRef={patientRef} enabled={apiAvailable} />}
        {screen === "integrations" && <LiveIntegrations results={integrations} refresh={refresh} />}
        {screen === "onboarding" && onboarding && <LiveOnboarding state={onboarding} setState={setOnboarding} enabled={admin && apiAvailable} />}
        {screen === "audit" && <LiveEvents thread={thread} />}
      </ScrollView>
    </View>
  </View></SafeAreaView>;
}

function LiveState({ title, copy, icon, action }: { title: string; copy: string; icon: IconName; action?: React.ReactNode }) {
  return <SafeAreaView style={s.statePage}><View style={s.stateMark}><Icon name={icon} size={28} color={C.coral} /></View><Text style={s.pageTitle}>{title}</Text><Text style={[s.lead, { textAlign: "center" }]}>{copy}</Text>{action && <View style={s.actionRow}>{action}</View>}</SafeAreaView>;
}

/** Exact-match patient lookup. Errors render in the page body so the field stays one line tall at every width. */
function LiveSearch({ value, setValue, run, state, compact }: { value: string; setValue: (v: string) => void; run: () => void; state: LiveActionState; compact: boolean }) {
  const disabled = state.busy || !value.trim();
  return <View accessibilityRole="search" style={s.liveSearch}>
    <Icon name="search" size={16} color={C.muted} />
    <TextInput accessibilityLabel="Exact hospital identifier (UHID or hospital number)" value={value} onChangeText={setValue} onSubmitEditing={run} returnKeyType="search" autoCapitalize="characters" autoCorrect={false} placeholder={compact ? "Exact UHID or hospital no." : "Open a patient by exact UHID or hospital number"} placeholderTextColor={C.muted} style={s.liveSearchInput} />
    <Pressable accessibilityRole="button" accessibilityLabel="Open patient thread" accessibilityState={{ disabled, busy: state.busy }} disabled={disabled} onPress={run} style={state2 => [s.liveSearchGo, disabled && s.disabled, focusRing(state2)]}>
      {compact ? <Icon name={state.busy ? "loader" : "arrow-right"} size={18} color={C.white} /> : <Text style={s.buttonText}>{state.busy ? "Searching…" : "Open thread"}</Text>}
    </Pressable>
  </View>;
}

function LiveHome({ principal, onboarding, integrations }: { principal: Principal; onboarding: OnboardingState | null; integrations: IntegrationResults }) {
  const all = Object.values(integrations);
  return <><SectionTitle kicker="LIVE HOSPITAL BOUNDARY" title="Connected sources, without invented patients." copy="Search by an exact hospital identifier to read the source-backed thread. Empty and offline states remain visible; no sample record is substituted." />
    <View style={s.metricStrip}><View style={s.metricCell}><Text style={s.metricValue}>{all.filter(x => x.reachable).length}</Text><Text style={s.metricLabel}>sources reachable</Text></View><View style={s.metricCell}><Text style={s.metricValue}>{all.filter(x => !x.reachable).length}</Text><Text style={s.metricLabel}>sources offline</Text></View><View style={s.metricCell}><Text style={s.metricValue}>{onboarding ? Object.values(onboarding.stages).filter(x => x === "complete" || x === "ready").length : "—"}</Text><Text style={s.metricLabel}>onboarding gates ready</Text></View><View style={s.metricNote}><Dot tone={onboarding?.goLiveAllowed ? "ok" : "warn"} /><Text>{onboarding?.goLiveAllowed ? "Hospital approved for live mode" : `Current stage: ${onboarding?.currentStage ?? "unavailable"}`}</Text></View></View>
    <View style={[s.columns, { flexWrap: "wrap" }]}><Card style={s.mainColumn}><Text style={s.kicker}>AUTHENTICATED PRINCIPAL</Text><Text style={s.h2}>{principal.Subject}</Text><View style={s.metaRow}><Text style={s.rowSmall}>Tenant</Text><Text style={s.rowStrong}>{principal.TenantID}</Text></View><View style={s.metaRow}><Text style={s.rowSmall}>Provider organization</Text><Text style={s.rowStrong}>{principal.ProviderOrgID || "not supplied"}</Text></View><View style={s.metaRow}><Text style={s.rowSmall}>Roles</Text><Text style={s.rowStrong}>{principal.Roles.join(", ")}</Text></View></Card><Card style={s.sideRail}><Text style={s.kicker}>SOURCE HEALTH</Text>{all.length === 0 ? <EmptyState title="No adapters returned" copy="Ask the hospital administrator to configure and probe an integration." /> : all.map(p => <View style={s.checkRow} key={p.manifest.adapterId}><Dot tone={p.reachable ? "ok" : "bad"} /><View style={{ flex: 1 }}><Text style={s.rowStrong}>{p.manifest.displayName}</Text><Text style={s.rowSmall}>{p.reachable ? p.manifest.authority : p.warnings.join(" · ") || "Source unavailable"}</Text></View></View>)}</Card></View>
  </>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) { return <View style={s.emptyState}><Icon name="inbox" color={C.muted} /><Text style={s.rowStrong}>{title}</Text><Text style={[s.rowSmall, { textAlign: "center" }]}>{copy}</Text></View>; }

const referencePatientRef = "meena-reference-001";
const TRANSITION_ROLES = ["doctor", "nurse", "records_clerk", "coordinator", "clinical_lead"];
const DONE_STATUSES = ["completed", "reviewed"];
const CLOSED_STATUSES = [...DONE_STATUSES, "cancelled"];
const IN_FLIGHT_STATUSES = ["awaiting_booking", "booked", "evidence_due", "evidence_received", "verified"];
const languageNames: Record<string, string> = { hi: "Hindi", en: "English", mr: "Marathi", ta: "Tamil", te: "Telugu", bn: "Bengali", kn: "Kannada", gu: "Gujarati" };

type ActorLane = "Patient / caregiver" | "Records" | "Nurse" | "Doctor" | "Source system" | "SUTRA";
const laneTone: Record<ActorLane, "neutral" | "good" | "warn" | "bad" | "blue"> = { "Patient / caregiver": "warn", Records: "neutral", Nurse: "good", Doctor: "blue", "Source system": "neutral", SUTRA: "neutral" };
const laneColor: Record<ActorLane, string> = { "Patient / caregiver": C.coral, Records: C.amber, Nurse: C.green, Doctor: C.blueInk, "Source system": C.muted, SUTRA: C.navy };

function actorLane(event: EventRecord, principal?: Principal): ActorLane {
  if (principal && event.actorRef === principal.Subject) {
    const roles = principal.Roles ?? [];
    return roles.includes("doctor") ? "Doctor" : roles.includes("nurse") ? "Nurse" : roles.includes("records_clerk") ? "Records" : "SUTRA";
  }
  const actor = event.actorRef.toLowerCase();
  if (actor.includes("ravi") || actor.includes("meena") || actor.includes("caregiver") || actor.includes("patient")) return "Patient / caregiver";
  if (actor.includes("record")) return "Records";
  if (actor.includes("nurse")) return "Nurse";
  if (actor.includes("dr-") || actor.includes("doctor")) return "Doctor";
  if (actor.startsWith("sutra")) return "SUTRA";
  return "Source system";
}

function eventTitle(value: string) {
  return value.toLowerCase().split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function humanize(value: string) { return value.replaceAll("_", " "); }

/** Hospital-local (IST) formatting so a reviewer on any machine sees the same clock as the ward. */
function istFormat(iso: string | undefined, options: Intl.DateTimeFormatOptions) {
  if (!iso || Number.isNaN(Date.parse(iso))) return "not set";
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", ...options }).format(new Date(iso));
}
const istDate = (iso?: string) => istFormat(iso, { day: "numeric", month: "short", year: "numeric" });
const istTime = (iso?: string) => istFormat(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
const istDateTime = (iso?: string) => iso ? `${istDate(iso)}, ${istTime(iso)} IST` : "not set";
function dueWindow(step: CareStep) {
  if (!step.dueStart && !step.dueEnd) return step.dueRule;
  const start = istFormat(step.dueStart, { day: "numeric", month: "short" });
  const end = istFormat(step.dueEnd, { day: "numeric", month: "short" });
  return step.dueStart && step.dueEnd && start !== end ? `${start} – ${end}` : step.dueStart ? start : end;
}

function stepTone(status: string): "neutral" | "good" | "warn" | "bad" | "blue" {
  if (DONE_STATUSES.includes(status)) return "good";
  if (status === "exception" || status === "cancelled") return "bad";
  if (IN_FLIGHT_STATUSES.includes(status)) return "warn";
  return "neutral";
}

type StepAction = { status: string; label: string; icon: IconName; confirm: string; reason: string };
/** Only transitions a person can truthfully attest to from this view. "booked" is deliberately absent: only the scheduler's confirmation may set it. */
function stepAction(step: CareStep, roles: string[]): StepAction | null {
  if (step.status === "planned" && roles.some(role => TRANSITION_ROLES.includes(role))) return { status: "awaiting_booking", label: "Request booking", icon: "calendar", confirm: "This records that the step needs a booking. The family is not told anything is booked until the scheduler returns its own confirmation.", reason: "Booking requested from the patient lifecycle view" };
  if (step.status === "evidence_received" && roles.some(role => ["records_clerk", "nurse", "doctor"].includes(role))) return { status: "verified", label: "Mark evidence verified", icon: "check-square", confirm: "Confirm you matched the original to this patient, document type and date. Verification does not interpret any values.", reason: "Original matched to patient, document type and date" };
  if (step.status === "verified" && roles.includes("doctor")) return { status: "reviewed", label: "Record doctor review", icon: "eye", confirm: "Confirm you opened the original document for this step. Any treatment decision must still be recorded in the source EHR.", reason: "Doctor reviewed the original evidence" };
  return null;
}

type LifecycleSection = "overview" | "plan" | "timeline" | "context";
const sectionLabels: Record<LifecycleSection, string> = { overview: "Overview", plan: "Plan", timeline: "Timeline", context: "Context" };

/**
 * One patient, four focused sections. Phones show one section at a time; desktop keeps Context
 * (work items, consent, identity) as a persistent rail beside the selected section.
 */
function LiveLifecycle({ principal, compact, scrollTop }: { principal: Principal; compact: boolean; scrollTop: () => void }) {
  const { width } = useWindowDimensions();
  const narrow = width < 640;
  const [patientRef, setPatientRef] = useState(referencePatientRef);
  const [lifecycle, setLifecycle] = useState<PatientLifecycle | null>(null);
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [state, setState] = useState<LiveActionState>({ busy: true });
  const [pending, setPending] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [section, setSection] = useState<LifecycleSection>("overview");
  const [syntheticDetails, setSyntheticDetails] = useState(false);
  const [toggledSteps, setToggledSteps] = useState<string[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const roles = principal.Roles ?? [];

  const loadLifecycle = async (ref = patientRef, success?: string) => {
    if (!ref.trim()) return;
    setState({ busy: true });
    try {
      const result = await api.patientLifecycle(ref.trim());
      setLifecycle(result);
      setShowPicker(false);
      setSelected(null);
      setState({ busy: false, success });
    } catch (error) { setLifecycle(null); setSelected(null); setState(errorState(error)); }
  };
  useEffect(() => { void loadLifecycle(referencePatientRef); }, []);

  const transition = async (step: CareStep, action: StepAction) => {
    setState({ busy: true });
    try {
      const updated = await api.transitionCareStep(step.id, action.status, action.reason);
      setPending(null);
      await loadLifecycle(lifecycle?.patient.sourcePatientId ?? patientRef, `“${updated.title}” is now ${humanize(updated.status)}. The audit event is recorded in the timeline.`);
    } catch (error) { setState(errorState(error)); }
  };

  const loader = <Card>
    <View style={[s.lifecycleLoader, narrow && { flexDirection: "column", alignItems: "stretch" }]}>
      <View style={{ flex: 1 }}><Text nativeID="lifecycle-ref-label" style={s.inputLabel}>SUTRA PATIENT REFERENCE</Text><TextInput accessibilityLabel="SUTRA patient reference" aria-labelledby="lifecycle-ref-label" value={patientRef} onChangeText={setPatientRef} onSubmitEditing={() => void loadLifecycle()} autoCapitalize="none" autoCorrect={false} style={s.formInput} /></View>
      <Button onPress={() => void loadLifecycle()} disabled={state.busy || !patientRef.trim()} busy={state.busy} icon="activity">{state.busy ? "Loading…" : "Open lifecycle"}</Button>
      <Button tone="secondary" onPress={() => { setPatientRef(referencePatientRef); void loadLifecycle(referencePatientRef); }} disabled={state.busy} icon="book-open">Load Meena reference</Button>
    </View>
    <View style={[s.infoBand, { marginTop: 16, marginBottom: 0 }]}><Icon name="info" color={C.blueInk} /><Text style={s.ruleText}>Meena D., Ravi, staff names, identifiers, dates and clinical details in the reference case are synthetic—not a real patient or pilot outcome.</Text></View>
  </Card>;

  if (!lifecycle) return <>
    <SectionTitle kicker="PATIENT LIFECYCLE" title="Follow one patient from first contact to the next due step." copy="The lifecycle is read from the SUTRA API for your tenant. The Meena reference journey is synthetic, persisted in PostgreSQL and returned by the same endpoint as a hospital case." />
    {state.busy ? <Card><View style={s.lifecycleLoading} accessibilityRole="progressbar" accessibilityLabel="Loading patient lifecycle" aria-busy><Icon name="loader" color={C.coral} /><Text style={s.rowStrong}>Loading GET /api/v1/patients/{patientRef}/lifecycle…</Text></View></Card> : <>
      {state.error && <View accessibilityLiveRegion="polite"><ActionError state={state} />{!state.offline && patientRef === referencePatientRef && <Text style={[s.boundary, { marginTop: 0, marginBottom: 14 }]}>If this is a fresh database, seed the synthetic reference with go run ./cmd/seed-reference and sign in to the SUTRA Reference Hospital tenant.</Text>}</View>}
      {loader}
    </>}
  </>;

  const synthetic = lifecycle.patient.sourceSnapshot?.synthetic === true || lifecycle.patient.sourcePatientId === referencePatientRef;
  const events = [...(lifecycle.events ?? [])].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const steps = [...(lifecycle.steps ?? [])].sort((a, b) => a.sequence - b.sequence);
  const workItems = lifecycle.workItems ?? [];
  const caregivers = lifecycle.caregivers ?? [];
  const openWork = workItems.filter(item => item.status !== "resolved");
  const resolvedWork = workItems.filter(item => item.status === "resolved");
  const done = steps.filter(step => DONE_STATUSES.includes(step.status)).length;
  const inFlight = steps.filter(step => IN_FLIGHT_STATUSES.includes(step.status)).length;
  const exceptions = steps.filter(step => step.status === "exception").length;
  const future = steps.filter(step => !CLOSED_STATUSES.includes(step.status));
  const nextStep = future[0];
  const now = Date.now();
  const overdue = (step: CareStep) => !!step.dueEnd && Date.parse(step.dueEnd) < now && !CLOSED_STATUSES.includes(step.status);
  const stepTitle = (id: unknown) => steps.find(step => step.id === id)?.title;
  const snapshot = lifecycle.patient.sourceSnapshot ?? {};
  const pct = (n: number) => steps.length ? `${(n / steps.length) * 100}%` as const : "0%" as const;
  const latest = events[events.length - 1];
  // Evidence waiting on this person; future bookings stay in the plan so the overview is not a wall of buttons.
  const alsoActionable = steps.filter(step => step.id !== nextStep?.id && step.status !== "planned" && stepAction(step, roles));

  const sections: LifecycleSection[] = compact ? ["overview", "plan", "timeline", "context"] : ["overview", "plan", "timeline"];
  const activeSection: LifecycleSection = !compact && section === "context" ? "overview" : section;
  const show = (next: LifecycleSection, toTop = false) => { setSection(next); if (toTop) scrollTop(); };
  // The next due step starts expanded; a toggle flips a step away from its default.
  const stepOpen = (step: CareStep) => (step.id === nextStep?.id) !== toggledSteps.includes(step.id) || pending === step.id;
  const toggleStep = (id: string) => setToggledSteps(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const stepWhen = (step: CareStep) => `${dueWindow(step)}${step.dueStart || step.dueEnd ? ` · ${step.dueRule}` : ""}`;
  const stepProvenance = (step: CareStep) => {
    const source = Object.entries(step.sourceReference ?? {}).filter(([, v]) => typeof v !== "object");
    return `Last change by ${step.updatedBy} · ${istDateTime(step.updatedAt)}${source.length ? ` · ${source.map(([k, v]) => `${k} ${String(v)}`).join(" · ")}` : ""}`;
  };

  const actionControl = (step: CareStep, primary: boolean) => {
    const action = stepAction(step, roles);
    if (!action) return null;
    if (pending !== step.id) return <Button tone={primary ? "primary" : "secondary"} icon={action.icon} disabled={state.busy} style={[s.stepButton, primary && narrow && s.fullWidth]} onPress={() => setPending(step.id)} accessibilityLabel={`${action.label} for ${step.title}`}>{action.label}</Button>;
    return <View style={s.confirmBox} accessibilityLiveRegion="polite"><Text style={[s.rowSmall, { color: C.ink }]}>{action.confirm}</Text><View style={[s.actionRow, { marginTop: 10 }]}><Button icon={action.icon} busy={state.busy} disabled={state.busy} onPress={() => void transition(step, action)} accessibilityLabel={`Confirm ${action.label} for ${step.title}`}>{state.busy ? "Saving…" : `Confirm · ${action.label}`}</Button><Button tone="quiet" disabled={state.busy} onPress={() => setPending(null)}>Cancel</Button></View></View>;
  };

  const header = <View style={[s.lcHeader, compact && s.lcHeaderCompact]}>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.kicker}>{synthetic ? "PATIENT LIFECYCLE · SYNTHETIC REFERENCE" : "PATIENT LIFECYCLE"}</Text>
      <Text accessibilityRole="header" style={[s.pageTitle, compact && { fontSize: 28, lineHeight: 33 }]}>{lifecycle.patient.displayName || lifecycle.patient.sourcePatientId}</Text>
      <Text style={[s.sub, { marginTop: 4 }]}>{[lifecycle.patient.hospitalIdentifier, snapshot.diagnosis, snapshot.regimen, snapshot.cycle ? `cycle ${String(snapshot.cycle)}` : ""].filter(Boolean).map(String).join(" · ")}</Text>
    </View>
    <View style={s.lcHeaderActions}>
      <Button tone="quiet" icon="refresh-cw" busy={state.busy} disabled={state.busy} onPress={() => void loadLifecycle(lifecycle.patient.sourcePatientId)} style={s.compactButton}>{state.busy ? "Reloading…" : "Reload"}</Button>
      <Button tone="quiet" icon="search" disabled={state.busy} onPress={() => setShowPicker(v => !v)} expanded={showPicker} style={s.compactButton}>{compact ? "Another patient" : "Open another patient"}</Button>
    </View>
  </View>;

  const syntheticBar = synthetic && <View style={s.syntheticBar}>
    <View style={s.syntheticRow} accessibilityRole="alert">
      <Icon name="alert-triangle" size={16} color={C.amber} />
      <Text style={s.syntheticTitle}>Synthetic · not a real patient</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={syntheticDetails ? "Hide synthetic data details" : "Show synthetic data details"} aria-expanded={syntheticDetails} onPress={() => setSyntheticDetails(v => !v)} style={state2 => [s.disclosure, focusRing(state2)]}>
        <Text style={[s.disclosureText, { color: C.amber }]}>{syntheticDetails ? "Hide" : "Details"}</Text><Icon name={syntheticDetails ? "chevron-up" : "chevron-down"} size={14} color={C.amber} />
      </Pressable>
    </View>
    {syntheticDetails && <Text style={[s.rowSmall, { color: C.ink, marginTop: 8 }]}>Meena D., Ravi, Dr Kulkarni, Nurse Priya, every identifier, date and clinical detail here are invented for the SUTRA pitch (slides 7–11). They are real rows returned by the lifecycle API and database, not a hospital record, a live ABDM exchange or a measured outcome. Sources marked “reference” or “sandbox” are illustrative.</Text>}
  </View>;

  const tabs = <View accessibilityRole="tablist" style={[s.lcTabs, compact && s.lcTabsCompact]}>{sections.map(id => {
    const active = activeSection === id;
    const count = id === "plan" ? `${done}/${steps.length}` : id === "timeline" ? String(events.length) : undefined;
    return <Pressable key={id} nativeID={`lifecycle-tab-${id}`} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => show(id)} style={state2 => [s.lcTab, compact && s.lcTabCompact, active && (compact ? s.lcTabCompactActive : s.lcTabActive), focusRing(state2)]}>
      <Text style={[s.lcTabText, active && s.lcTabTextActive]} numberOfLines={1}>{sectionLabels[id]}</Text>
      {!compact && count && <Text style={s.lcTabCount}>{count}</Text>}
    </Pressable>;
  })}</View>;

  const nextCard = <View style={s.nextCard}>
    <Text style={s.kicker}>{nextStep ? `NEXT DUE · STEP ${nextStep.sequence} OF ${steps.length}` : "NEXT DUE"}</Text>
    {nextStep ? <>
      <Text accessibilityRole="header" style={[s.nextTitle, compact && { fontSize: 21, lineHeight: 27 }]}>{nextStep.title}</Text>
      <View style={s.stepHead}><Chip tone={stepTone(nextStep.status)}>{humanize(nextStep.status)}</Chip>{overdue(nextStep) && <Chip tone="bad">Overdue</Chip>}</View>
      <View style={s.nextFacts}>
        {([["Due", stepWhen(nextStep)], ["Owner", humanize(nextStep.ownerRole)], ["Evidence required", nextStep.evidenceRequired]] as const).map(([label, value]) => <View key={label} style={s.nextFact}><Text style={s.inputLabel}>{label.toUpperCase()}</Text><Text style={s.rowStrong}>{value}</Text></View>)}
      </View>
      <Text style={s.familyLine}>Family wording: “{nextStep.familyWording}”</Text>
      {actionControl(nextStep, true) ?? <Text style={s.boundary}>No transition is available to your role on this step. The {humanize(nextStep.ownerRole)} team owns it.</Text>}
    </> : <Text style={s.rowStrong}>Every signed step is closed.</Text>}
  </View>;

  const tile = (id: LifecycleSection, icon: IconName, label: string, value: string, detail: string, extra?: React.ReactNode) =>
    <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. ${detail}. Open ${sectionLabels[id]}.`} onPress={() => show(id, true)} style={state2 => [s.tile, narrow && s.tileStacked, focusRing(state2)]}>
      <View style={s.tileHead}><Icon name={icon} size={14} color={C.coral} /><Text style={[s.inputLabel, { marginBottom: 0 }]}>{label.toUpperCase()}</Text></View>
      <Text style={s.tileValue}>{value}</Text>
      {extra}
      <Text style={s.rowSmall} numberOfLines={2}>{detail}</Text>
      <Text style={s.tileLink}>Open {sectionLabels[id].toLowerCase()} →</Text>
    </Pressable>;
  const consentSummary = caregivers.length ? caregivers.map(c => `${c.displayName} ${c.revokedAt ? "revoked" : c.consentStatus}`).join(", ") : "no caregiver linked";

  const overview = <>
    {nextCard}
    {alsoActionable.length > 0 && <Card style={s.lcCard}><Text style={s.kicker}>ALSO WAITING ON YOU</Text>{alsoActionable.map(step => <View key={step.id} style={s.workItem}><View style={s.stepHead}><Text style={[s.rowStrong, { flexShrink: 1 }]}>{step.title}</Text><Chip tone={stepTone(step.status)}>{humanize(step.status)}</Chip></View><Text style={s.rowSmall}>{stepWhen(step)} · owner {humanize(step.ownerRole)}</Text>{actionControl(step, false)}</View>)}</Card>}
    <View style={[s.tiles, narrow && { flexDirection: "column" }]}>
      {tile("plan", "list", "Signed plan", `${done} of ${steps.length} done`, lifecycle.plan ? `${lifecycle.plan.title} · ${inFlight} in progress${exceptions ? ` · ${exceptions} exception` : ""}` : "No doctor-signed plan yet", <View style={[s.progressTrack, { marginVertical: 6 }]}><View style={[s.progressDone, { width: pct(done) }]} /><View style={[s.progressFlight, { width: pct(inFlight) }]} /><View style={[s.progressException, { width: pct(exceptions) }]} /></View>)}
      {tile("timeline", "clock", "Timeline", `${events.length} events`, latest ? `Latest: ${eventTitle(latest.eventType)} · ${istDateTime(latest.occurredAt)}` : "No events recorded")}
      {compact && tile("context", "users", "Context", `${openWork.length} open work item${openWork.length === 1 ? "" : "s"}`, `Consent: ${consentSummary} · source ${lifecycle.patient.sourceSystem}`)}
    </View>
    <View style={[s.authorityBand, { marginBottom: 0 }]}><Icon name="shield" size={16} color={C.navy} /><Text style={s.ruleText}>{lifecycle.notice}</Text></View>
  </>;

  const plan = <Card style={s.lcCard}>
    <View style={s.headingRow}><View style={{ flex: 1, minWidth: 200 }}><Text style={s.kicker}>SIGNED CARE PLAN</Text><Text accessibilityRole="header" style={s.h2}>{lifecycle.plan?.title ?? "No signed plan"}</Text><Text style={s.sub}>{lifecycle.plan ? `Version ${lifecycle.plan.version} · signed ${istDateTime(lifecycle.plan.signedAt)} by ${lifecycle.plan.signedBy}` : "No doctor-signed plan version exists for this patient yet."}</Text></View>{lifecycle.plan && <Chip tone="good">Signed v{lifecycle.plan.version}</Chip>}</View>
    {lifecycle.plan && <>
      <View style={s.progressTrack} accessibilityRole="progressbar" accessibilityLabel={`${done} of ${steps.length} steps reviewed or completed, ${inFlight} in progress, ${exceptions} exceptions`} accessibilityValue={{ min: 0, max: steps.length, now: done }}>
        <View style={[s.progressDone, { width: pct(done) }]} /><View style={[s.progressFlight, { width: pct(inFlight) }]} /><View style={[s.progressException, { width: pct(exceptions) }]} />
      </View>
      <View style={s.progressLegend}><Text style={s.rowSmall}><Text style={{ color: C.green, fontWeight: "800" }}>■</Text> {done} reviewed or completed</Text><Text style={s.rowSmall}><Text style={{ color: C.amber, fontWeight: "800" }}>■</Text> {inFlight} in progress</Text><Text style={s.rowSmall}><Text style={{ color: C.line, fontWeight: "800" }}>■</Text> {steps.length - done - inFlight - exceptions} planned or closed</Text>{exceptions > 0 && <Text style={s.rowSmall}><Text style={{ color: C.red, fontWeight: "800" }}>■</Text> {exceptions} exception</Text>}</View>
      {Array.isArray(lifecycle.plan.content?.rules) && <View style={s.planRules}>{(lifecycle.plan.content.rules as unknown[]).map(rule => <View key={String(rule)} style={s.planRule}><Icon name="check" size={14} color={C.green} /><Text style={[s.rowSmall, { flex: 1, color: C.ink }]}>{String(rule)}</Text></View>)}</View>}
    </>}
    <View style={s.stepList}>{steps.map(step => {
      const isNext = nextStep?.id === step.id;
      const closed = DONE_STATUSES.includes(step.status);
      const open = stepOpen(step);
      return <View key={step.id} style={[s.stepRow, isNext && s.stepRowNext]}>
        <View style={[s.stepNumber, closed && { backgroundColor: C.green }, !closed && !isNext && s.stepNumberFuture]}><Text style={[s.stepNumberText, !closed && !isNext && { color: C.navy }]}>{closed ? "✓" : step.sequence}</Text></View>
        <View style={{ flex: 1, gap: 5, minWidth: 0 }}>
          <View style={s.stepHead}><Text style={[s.rowStrong, { flexShrink: 1 }]}>{step.title}</Text><Chip tone={stepTone(step.status)}>{humanize(step.status)}</Chip>{isNext && <Chip tone="blue">Next due</Chip>}{overdue(step) && <Chip tone="bad">Overdue</Chip>}</View>
          <Text style={s.rowSmall}>{stepWhen(step)} · owner {humanize(step.ownerRole)}</Text>
          {open && <View style={s.stepDetails} nativeID={`step-details-${step.id}`}>
            <Text style={s.stepEvidence}>Evidence: {step.evidenceRequired}</Text>
            <Text style={s.familyLine}>Family wording: “{step.familyWording}”</Text>
            <Text style={s.provLine}>{stepProvenance(step)}</Text>
          </View>}
          <View style={s.stepControls}>
            {actionControl(step, false)}
            <Pressable accessibilityRole="button" aria-expanded={open} accessibilityLabel={`${open ? "Hide" : "Show"} evidence and source for ${step.title}`} onPress={() => toggleStep(step.id)} disabled={pending === step.id} style={state2 => [s.disclosure, focusRing(state2)]}>
              <Text style={s.disclosureText}>{open ? "Hide details" : "Evidence & source"}</Text><Icon name={open ? "chevron-up" : "chevron-down"} size={14} color={C.blueInk} />
            </Pressable>
          </View>
        </View>
      </View>;
    })}{steps.length === 0 && <EmptyState title="No care steps" copy="Steps appear here once a doctor signs a care plan for this patient." />}</View>
    <Text style={s.boundary}>Steps awaiting booking move to “booked” only when the hospital scheduler returns an appointment ID and a confirmed source status.</Text>
  </Card>;

  const timeline = <Card style={s.lcCard}>
    <View style={s.headingRow}><View style={{ flex: 1, minWidth: 200 }}><Text style={s.kicker}>TIMELINE · EVENT LEDGER</Text><Text accessibilityRole="header" style={s.h2}>Who did what, from which source</Text></View><Text style={s.sub}>{compact ? "Tap" : "Select"} an event to see its stored provenance.</Text></View>
    <View style={s.actorLegend}>{(Object.keys(laneColor) as ActorLane[]).map(lane => <View key={lane} style={s.legendItem}><View style={[s.legendDot, { backgroundColor: laneColor[lane] }]} /><Text style={s.rowSmall}>{lane}</Text></View>)}</View>
    {events.length === 0 ? <EmptyState title="No events recorded" copy="The ledger for this patient is empty." /> : <View style={s.lifecycleTimeline}>{events.map((event, index) => {
      const lane = actorLane(event, principal); const active = selected?.id === event.id;
      const showDate = index === 0 || istDate(events[index - 1].occurredAt) !== istDate(event.occurredAt);
      return <View key={event.id}>
        {showDate && <Text style={s.timelineDate} accessibilityRole="header">{istFormat(event.occurredAt, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</Text>}
        <Pressable accessibilityRole="button" aria-expanded={active} accessibilityLabel={`${istTime(event.occurredAt)}, ${lane}, ${eventTitle(event.eventType)}, actor ${event.actorRef}, source ${event.sourceSystem}`} onPress={() => setSelected(active ? null : event)} style={state2 => [s.lifecycleEvent, active && s.lifecycleEventActive, focusRing(state2)]}>
          <View style={s.lifecycleRail}><View style={[s.lifecycleDot, { backgroundColor: laneColor[lane] }]} />{index < events.length - 1 && <View style={s.threadLine} />}</View>
          <Text style={s.eventTime}>{istTime(event.occurredAt)}</Text>
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <View style={s.eventHeadline}><Text style={s.eventTitle}>{eventTitle(event.eventType)}</Text>{!narrow && <Chip tone={laneTone[lane]}>{lane}</Chip>}</View>
            <Text style={s.rowSmall}>{narrow ? `${lane} · ` : ""}Actor <Text style={s.mono}>{event.actorRef}</Text> · source <Text style={s.mono}>{event.sourceSystem}</Text></Text>
          </View>
          <Icon name={active ? "chevron-up" : "chevron-down"} color={active ? C.coral : C.muted} />
        </Pressable>
        {active && <EventProvenance event={event} />}
      </View>;
    })}</View>}
  </Card>;

  const context = <>
    <Card style={s.lcCard}>
      <View style={s.headingRow}><Text style={[s.kicker, { marginBottom: 0 }]}>WORK ITEMS</Text><Chip tone={openWork.length ? "warn" : "good"}>{openWork.length} open</Chip></View>
      {openWork.length === 0 && <EmptyState title="No open work" copy="All current operational handoffs are resolved." />}
      {openWork.map(item => <WorkItemRow key={item.id} item={item} stepTitle={stepTitle(item.sourceReference?.careStepId)} />)}
      {resolvedWork.length > 0 && <Pressable accessibilityRole="button" aria-expanded={showResolved} onPress={() => setShowResolved(v => !v)} style={state2 => [s.disclosure, { marginTop: 10 }, focusRing(state2)]}><Text style={s.disclosureText}>{showResolved ? "Hide" : "Show"} resolved ({resolvedWork.length})</Text><Icon name={showResolved ? "chevron-up" : "chevron-down"} size={14} color={C.blueInk} /></Pressable>}
      {showResolved && resolvedWork.map(item => <WorkItemRow key={item.id} item={item} stepTitle={stepTitle(item.sourceReference?.careStepId)} />)}
      <Text style={s.boundary}>Work items are resolved by the owning team in their queue; this view reads them from the API.</Text>
    </Card>
    <Card style={s.lcCard}>
      <Text style={s.kicker}>CAREGIVER CONSENT</Text>
      {caregivers.length === 0 ? <EmptyState title="No caregiver linked" copy="Family messages cannot be sent until a caregiver is verified and consents." /> : caregivers.map(caregiver => {
        const revoked = !!caregiver.revokedAt || caregiver.consentStatus === "revoked";
        return <View key={caregiver.id} style={s.caregiverCard}>
          <Avatar letters={caregiver.displayName.slice(0, 2).toUpperCase()} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={s.stepHead}><Text style={s.rowStrong}>{caregiver.displayName} · {caregiver.relationship}</Text><Chip tone={revoked ? "bad" : caregiver.consentStatus === "granted" ? "good" : "warn"}>{revoked ? "consent revoked" : `consent ${caregiver.consentStatus}`}</Chip></View>
            <Text style={s.rowSmall}>Prefers {languageNames[caregiver.preferredLanguage] ?? caregiver.preferredLanguage}</Text>
            <Text style={s.rowSmall}>Recorded via <Text style={s.mono}>{caregiver.consentSource || "unknown source"}</Text>{caregiver.verifiedAt ? ` · verified ${istDateTime(caregiver.verifiedAt)}` : " · not verified"}</Text>
            {caregiver.revokedAt && <Text style={[s.rowSmall, { color: C.red }]}>Revoked {istDateTime(caregiver.revokedAt)}</Text>}
          </View>
        </View>;
      })}
      <Text style={s.boundary}>A phone number is a channel, not an identity. Consent covers operational messages only.</Text>
    </Card>
    <Card style={s.lcCard}>
      <Text style={s.kicker}>IDENTITY AND SOURCE</Text>
      {[["Hospital ID", lifecycle.patient.hospitalIdentifier || "not supplied"], ["SUTRA reference", lifecycle.patient.sourcePatientId], ["Source system", lifecycle.patient.sourceSystem], ["ABHA", lifecycle.patient.maskedAbha ? `${lifecycle.patient.maskedAbha}${lifecycle.patient.abhaVerifiedAt ? ` · verified ${istDate(lifecycle.patient.abhaVerifiedAt)}` : ""}` : "not linked"], ["Last synced", istDateTime(lifecycle.patient.lastSyncedAt)]].map(([label, value]) => <View key={label} style={s.metaRow}><Text style={s.rowSmall}>{label}</Text><Text selectable style={[s.rowStrong, s.metaValue]}>{value}</Text></View>)}
    </Card>
  </>;

  return <>
    {header}
    {showPicker && <View style={{ marginBottom: 16 }}>{loader}</View>}
    {syntheticBar}
    {state.error && <View accessibilityLiveRegion="assertive"><ActionError state={state} /></View>}
    {state.success && <View accessibilityLiveRegion="polite" style={{ marginBottom: 14 }}><Success text={state.success} /></View>}
    {tabs}
    <View style={[s.columns, compact && { flexDirection: "column", alignItems: "stretch" }]}>
      <View role="tabpanel" aria-labelledby={`lifecycle-tab-${activeSection}`} style={[s.mainColumn, { gap: 16 }]}>
        {activeSection === "overview" && overview}
        {activeSection === "plan" && plan}
        {activeSection === "timeline" && timeline}
        {activeSection === "context" && context}
      </View>
      {!compact && <View style={s.lifecycleSide} role="complementary" aria-label="Patient context">{context}</View>}
    </View>
  </>;
}

function WorkItemRow({ item, stepTitle }: { item: WorkItem; stepTitle?: string }) {
  const resolved = item.status === "resolved";
  const detail = item.sourceReference?.nextAction ?? item.sourceReference?.outcome;
  return <View style={s.workItem}>
    <View style={s.stepHead}><Text style={[s.rowStrong, { flexShrink: 1 }]}>{eventTitle(item.kind)}</Text><Chip tone={resolved ? "good" : "warn"}>{item.status}</Chip></View>
    <Text style={s.rowSmall}>Owner {humanize(item.ownerRole)}{item.ownerId ? ` (${item.ownerId})` : ""} · {resolved ? `resolved ${istDateTime(item.resolvedAt)}` : `due ${istDateTime(item.dueAt)}`}</Text>
    {stepTitle && <Text style={s.rowSmall}>Care step: {stepTitle}</Text>}
    {detail !== undefined && <Text style={[s.rowSmall, { color: C.ink }]}>{String(detail)}</Text>}
  </View>;
}

function EventProvenance({ event, dark = false }: { event: EventRecord; dark?: boolean }) {
  const rows: [string, string][] = [["Occurred", istDateTime(event.occurredAt)], ["Actor", event.actorRef], ["Source system", event.sourceSystem], ["Event ID", event.id], ["Correlation", event.correlationId]];
  return <View style={dark ? undefined : s.inlineProvenance}>
    <Text style={dark ? s.runbookTitle : s.threadTitle}>{eventTitle(event.eventType)}</Text>
    {rows.map(([label, value]) => <View key={label} style={s.provRow}><Text style={[s.rowSmall, dark && { color: "#AEB5CB" }]}>{label}</Text><Text selectable style={[s.mono, s.provValue, dark && { color: C.white }]}>{value}</Text></View>)}
    <Text style={[s.inputLabel, { marginTop: 12, marginBottom: 0 }, dark && { color: "#AEB5CB" }]}>STORED PAYLOAD</Text>
    <Text selectable style={s.provenanceJson}>{JSON.stringify(event.payload, null, 2)}</Text>
  </View>;
}

function LivePatient({ thread, go, doctor }: { thread: PatientThreadData | null; go: (s: ScreenId) => void; doctor: boolean }) {
  if (!thread) return <><SectionTitle kicker="PATIENT THREAD" title="Search an exact identifier." copy="SUTRA never guesses or performs a partial patient match in production mode." /><EmptyState title="No patient open" copy="Use the exact hospital identifier field above." /></>;
  const combined = [
    ...thread.encounters.map(x => ({ time: x.occurredAt, title: x.type || x.reference.display || "Encounter", source: x.reference.system, detail: x.reference.id })),
    ...thread.sutraEvents.map(x => ({ time: x.occurredAt, title: x.eventType, source: x.sourceSystem, detail: x.correlationId }))
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  return <>
    <SectionTitle kicker="EXACT SOURCE MATCH" title={thread.patient.displayName} copy={`${thread.patient.identifiers.join(" · ")} · ${thread.notice}`} action={<Chip tone="good">{thread.patient.reference.system}</Chip>} />
    <View style={[s.columns, { flexWrap: "wrap" }]}>
      <Card style={s.mainColumn}>{combined.length === 0 ? <EmptyState title="No encounters or SUTRA events returned" copy="The patient exists in the source, but the thread is empty." /> : combined.map((item, i) => <View style={s.liveEvent} key={`${item.source}-${item.time}-${i}`}><View style={s.threadRail}><View style={s.threadDot} />{i < combined.length - 1 && <View style={s.threadLine} />}</View><View style={{ flex: 1 }}><Text style={s.threadDate}>{new Date(item.time).toLocaleString()}</Text><Text style={s.threadTitle}>{item.title}</Text><Text style={s.rowSmall}>{item.detail}</Text><View style={{ marginTop: 7 }}><Chip tone="blue">{item.source}</Chip></View></View></View>)}</Card>
      <Card style={s.sideRail}><Text style={s.kicker}>PATIENT SOURCE</Text><Text style={s.h2}>{thread.patient.reference.resourceType}</Text><View style={s.metaRow}><Text style={s.rowSmall}>External ID</Text><Text style={s.rowStrong}>{thread.patient.reference.id}</Text></View><View style={s.metaRow}><Text style={s.rowSmall}>Birth date</Text><Text style={s.rowStrong}>{thread.patient.birthDate || "not returned"}</Text></View><View style={s.metaRow}><Text style={s.rowSmall}>Gender</Text><Text style={s.rowStrong}>{thread.patient.gender || "not returned"}</Text></View>{doctor ? <><Button onPress={() => go("dictation")} icon="mic">Start dictation</Button><Button onPress={() => go("appointment")} tone="secondary" icon="calendar">Request appointment</Button></> : <Text style={s.boundary}>Doctor-only signing and booking actions are hidden for this role.</Text>}</Card>
    </View>
  </>;
}

function SourceUnavailable({ title, copy }: { title: string; copy: string }) { return <View style={s.offlineBand}><Icon name="wifi-off" color={C.red} /><View style={{ flex: 1 }}><Text style={s.rowStrong}>{title}</Text><Text style={s.rowSmall}>{copy}</Text></View></View>; }

function LiveDictation({ patientRef, enabled }: { patientRef: string; enabled: boolean }) {
  const [result, setResult] = useState<TranscriptResponse | null>(null); const [state, setState] = useState<LiveActionState>({ busy: false }); const [confirmed, setConfirmed] = useState(false);
  const pick = async () => { const picked = await DocumentPicker.getDocumentAsync({ type: "audio/*", copyToCacheDirectory: true }); if (picked.canceled) return; setState({ busy: true }); try { setResult(await api.transcribe(picked.assets[0], patientRef, "hi")); setConfirmed(false); setState({ busy: false }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="ON-PREMISES SPEECH-TO-TEXT" title="Upload dictation, then confirm the draft." copy="The API transcript is never a signed record. A doctor must confirm medicines, dates, doses and negation." />{!patientRef && <SourceUnavailable title="No patient selected" copy="Open an exact patient thread before uploading audio." />}{!enabled && <SourceUnavailable title="Dictation unavailable" copy="The API must be reachable and the authenticated role must include doctor. If STT is offline, the API returns an explicit source error." />}<Card><Button onPress={() => void pick()} disabled={!enabled || !patientRef || state.busy} icon="mic">{state.busy ? "Transcribing…" : "Choose audio file"}</Button>{state.error && <ActionError state={state} />}{result && <View style={{ marginTop: 18 }}><Text style={s.inputLabel}>{result.transcript.engine} · {result.transcript.engineVersion} · DRAFT</Text><TextInput multiline style={[s.textArea, { minHeight: 160 }]} defaultValue={result.transcript.text} /><Pressable onPress={() => setConfirmed(v => !v)} style={s.confirmLine}><View style={[s.checkbox, confirmed && s.checkboxOn]}>{confirmed && <Icon name="check" color={C.white} />}</View><Text style={s.rowStrong}>I checked every clinical line against the audio.</Text></Pressable><Chip tone={confirmed ? "good" : "warn"}>{confirmed ? "Doctor confirmed draft" : "Not confirmed"}</Chip><Text style={s.boundary}>{result.notice}</Text></View>}</Card></>;
}

function LiveDocuments({ patientRef, enabled }: { patientRef: string; enabled: boolean }) {
  const [type, setType] = useState(""); const [result, setResult] = useState<DocumentResponse | null>(null); const [state, setState] = useState<LiveActionState>({ busy: false });
  const pick = async () => { const picked = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true }); if (picked.canceled) return; setState({ busy: true }); try { setResult(await api.uploadDocument(picked.assets[0], patientRef, type || "unknown")); setState({ busy: false }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="MULTIPART DOCUMENT INGEST" title="Upload an original for human verification." copy="The immutable original stays authoritative. Any OCR returned by the API remains a draft." />{!enabled && <SourceUnavailable title="Document upload unavailable" copy="The API is offline or your role cannot upload. OCR failure does not discard an accepted original; the API returns a retry warning." />}<Card><Text style={s.inputLabel}>DOCUMENT TYPE</Text><TextInput value={type} onChangeText={setType} placeholder="e.g. CBC report" style={s.formInput} /><Button disabled={!enabled || !patientRef || state.busy} onPress={() => void pick()} icon="upload">{state.busy ? "Uploading…" : "Choose image or PDF"}</Button>{!patientRef && <Text style={s.inlineError}>Open a patient thread first.</Text>}{state.error && <ActionError state={state} />}{result && <View style={{ marginTop: 18 }}><View style={s.goodBand}><Icon name="check-circle" color={C.green} /><Text style={s.ruleText}>Document {result.document.id} stored · verification {result.document.verificationStatus}</Text></View><Text style={s.boundary}>{result.notice}</Text>{result.ocr ? <View style={s.jsonPanel}><Text style={s.inputLabel}>OCR DRAFT · {result.ocr.engine} {result.ocr.engineVersion}</Text><Text selectable style={s.code}>{JSON.stringify(result.ocr.pages, null, 2)}</Text></View> : <EmptyState title="No OCR payload returned" copy={result.warning || "The source original was stored without extraction."} />}</View>}</Card></>;
}

function LiveRouting({ patientRef, enabled }: { patientRef: string; enabled: boolean }) {
  const [text, setText] = useState(""); const [result, setResult] = useState<RouteDecision | null>(null); const [state, setState] = useState<LiveActionState>({ busy: false });
  const route = async () => { setState({ busy: true }); try { setResult(await api.routeMessage(text, patientRef)); setState({ busy: false }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="JEV-ASSISTED OPERATIONAL ROUTING" title="Route a real inbound message." copy="JEV may suggest one allowed operational topic. Clinician-approved code chooses the staff queue. Emergency phrases bypass JEV and immediately alert a person." /><Card><Text style={s.inputLabel}>INBOUND MESSAGE TEXT</Text><TextInput value={text} onChangeText={setText} multiline placeholder="Paste the inbound message from the connected channel" style={[s.textArea, { minHeight: 110 }]} /><Button disabled={!enabled || !text.trim() || state.busy} onPress={() => void route()} icon="git-branch">{state.busy ? "Routing…" : "Route through API"}</Button>{state.error && <ActionError state={state} />}{result && <View style={{ marginTop: 18 }}><View style={[s.decisionGrid, { flexWrap: "wrap" }]}>{[["Topic", result.topic], ["Destination", result.destination], ["Confidence", result.confidence.toFixed(2)], ["Decision", result.decisionMethod], ["Classifier", result.classifierModel || (result.decisionMethod === "clinician_approved_phrase_rule" ? "Bypassed" : "Unavailable")]].map(x => <View style={{ minWidth: 150, flex: 1 }} key={x[0]}><Text style={s.inputLabel}>{x[0]}</Text><Text style={s.rowStrong}>{x[1]}</Text></View>)}</View>{result.deferredToHuman && <SourceUnavailable title="Deferred to a person" copy="Confidence or subject was outside the bounded automation policy." />}{result.emergencyNotice && <View style={s.dangerBand}><Icon name="phone-call" color={C.red} /><Text style={s.ruleText}>{result.emergencyNotice}</Text></View>}<Text style={s.boundary}>Confidence describes topic classification only. No severity score is calculated.</Text></View>}</Card></>;
}

function LiveCarePlan({ patientRef, enabled }: { patientRef: string; enabled: boolean }) {
  const [title, setTitle] = useState(""); const [step, setStep] = useState({ title: "", ownerRole: "", dueRule: "", evidenceRequired: "", familyWording: "" }); const [state, setState] = useState<LiveActionState>({ busy: false });
  const valid = patientRef && title.trim() && Object.values(step).every(x => x.trim()) && !state.offline;
  const sign = async () => { setState({ busy: true }); const draft: CarePlanDraft = { patientRef, title, steps: [step] }; try { const out = await api.signCarePlan(draft); setState({ busy: false, success: `Signed version ${out.carePlanVersionId}` }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="DOCTOR-SIGNED CARE PLAN" title="Author against the open patient." copy="Production starts empty. Nothing is inferred from a fixture, transcript or OCR result." />{!enabled && <SourceUnavailable title="Signing unavailable" copy="The API must be reachable and the authenticated role must include doctor." />}<Card><LiveField label="PLAN TITLE" value={title} set={setTitle} placeholder="Enter the doctor-approved pathway title" />{(["title", "ownerRole", "dueRule", "evidenceRequired", "familyWording"] as const).map(key => <LiveField key={key} label={key.replace(/([A-Z])/g, " $1").toUpperCase()} value={step[key]} set={v => setStep({ ...step, [key]: v })} placeholder={`Enter ${key}`} />)}<Button disabled={!enabled || !valid || state.busy} onPress={() => void sign()} icon="edit-3">{state.busy ? "Signing…" : "Sign care plan"}</Button>{state.error && <ActionError state={state} />}{state.success && <Success text={state.success} />}</Card></>;
}

function LivePrescription({ patientRef, enabled }: { patientRef: string; enabled: boolean }) {
  const [item, setItem] = useState({ medicine: "", dose: "", route: "", frequency: "", duration: "" }); const [notes, setNotes] = useState(""); const [state, setState] = useState<LiveActionState>({ busy: false });
  const valid = patientRef && item.medicine.trim() && item.dose.trim() && item.frequency.trim() && item.duration.trim() && !state.offline;
  const sign = async () => { setState({ busy: true }); const draft: PrescriptionDraft = { patientRef, items: [item], notes }; try { const out = await api.signPrescription(draft); setState({ busy: false, success: `Signed version ${out.prescriptionVersionId}. ${out.notice}` }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="DOCTOR-AUTHORED PRESCRIPTION" title="Write and sign; never derive from OCR." copy="The API stores a versioned SUTRA prescription. Clinical EHR write-back occurs only when a connector advertises that capability." />{!enabled && <SourceUnavailable title="Signing unavailable" copy="The API must be reachable and the authenticated role must include doctor." />}<Card>{(["medicine", "dose", "route", "frequency", "duration"] as const).map(key => <LiveField key={key} label={key.toUpperCase()} value={item[key]} set={v => setItem({ ...item, [key]: v })} placeholder={`Enter ${key}`} />)}<LiveField label="NOTES" value={notes} set={setNotes} placeholder="Optional pharmacy note" /><Button disabled={!enabled || !valid || state.busy} onPress={() => void sign()} icon="send">{state.busy ? "Signing…" : "Sign prescription"}</Button>{state.error && <ActionError state={state} />}{state.success && <Success text={state.success} />}</Card></>;
}

function LiveAppointment({ thread, enabled }: { thread: PatientThreadData | null; enabled: boolean }) {
  const [service, setService] = useState(""); const [location, setLocation] = useState(""); const [start, setStart] = useState(""); const [end, setEnd] = useState(""); const [reason, setReason] = useState(""); const [state, setState] = useState<LiveActionState>({ busy: false });
  const valid = thread && service && location && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) && !state.offline;
  const book = async () => { if (!thread) return; setState({ busy: true }); try { const out = await api.createAppointment({ patient: thread.patient.reference, service: { system: "hospital-scheduler", resourceType: "AppointmentService", id: service }, location: { system: "hospital-scheduler", resourceType: "Location", id: location }, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), idempotencyKey: `${thread.patient.reference.id}-${Date.parse(start)}`, reason }); setState({ busy: false, success: `Source confirmed the appointment. Family notification allowed: ${out.familyNotificationAllowed}.` }); } catch (e) { setState(errorState(e)); } };
  return <><SectionTitle kicker="AUTHORITATIVE SCHEDULER" title="Request once; confirm only from the source." copy="No family confirmation is allowed until the appointment API returns its external identifier and source status." />{!enabled && <SourceUnavailable title="Booking disabled" copy="The scheduler is offline, lacks appointment.write, or the current session cannot book." />}<Card><LiveField label="SERVICE UUID" value={service} set={setService} placeholder="Exact scheduler service ID" /><LiveField label="LOCATION UUID" value={location} set={setLocation} placeholder="Exact scheduler location ID" /><LiveField label="STARTS AT" value={start} set={setStart} placeholder="2026-10-01T09:00:00+05:30" /><LiveField label="ENDS AT" value={end} set={setEnd} placeholder="2026-10-01T09:30:00+05:30" /><LiveField label="REASON" value={reason} set={setReason} placeholder="Optional operational reason" /><Button disabled={!enabled || !valid || state.busy} onPress={() => void book()} icon="calendar">{state.busy ? "Waiting for source…" : "Request appointment"}</Button>{state.error && <ActionError state={state} />}{state.success && <Success text={state.success} />}</Card></>;
}

function LiveIntegrations({ results, refresh }: { results: IntegrationResults; refresh: () => Promise<void> }) {
  const entries = Object.entries(results);
  return <><SectionTitle kicker="REAL ADAPTER PROBES" title="Every source reports its own health." copy="Reachability, advertised capabilities, checks and warnings come directly from /api/v1/integrations." action={<Button onPress={() => void refresh()} tone="secondary" icon="refresh-cw">Probe again</Button>} />{entries.length === 0 ? <EmptyState title="No integration probes returned" copy="Configure adapters on the Go API, then retry." /> : <View style={s.integrationGrid}>{entries.map(([key, p]) => <Card key={key} style={s.integrationCard}><View style={s.spaceBetween}><View style={s.integrationIcon}><Icon name="server" /></View><Chip tone={p.reachable ? "good" : "bad"}>{p.reachable ? "Reachable" : "Offline"}</Chip></View><Text style={s.h2}>{p.manifest.displayName || key}</Text><Text style={s.sub}>{p.manifest.authority}</Text><Text style={s.rowSmall}>Adapter {p.manifest.adapterId} · {p.manifest.version}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>{p.manifest.capabilities.map(c => <Chip key={c}>{c}</Chip>)}</View>{p.checks.map(check => <View key={check} style={s.checkRow}><Icon name="check-circle" size={15} color={C.green} /><Text style={s.rowSmall}>{check}</Text></View>)}{p.warnings.map(w => <Text key={w} style={s.inlineError}>{w}</Text>)}</Card>)}</View>}</>;
}

function LiveOnboarding({ state, setState, enabled }: { state: OnboardingState; setState: (s: OnboardingState) => void; enabled: boolean }) {
  const [action, setAction] = useState<LiveActionState>({ busy: false });
  const patchStage = async (stage: string, status: string) => { setAction({ busy: true }); try { setState(await api.updateOnboarding(stage, status)); setAction({ busy: false, success: `${stage} updated to ${status}.` }); } catch (e) { setAction(errorState(e)); } };
  return <><SectionTitle kicker="SERVER-BACKED ONBOARDING" title={state.hospitalName} copy={`Current stage: ${state.currentStage}. Updated ${new Date(state.updatedAt).toLocaleString()}.`} action={<Chip tone={state.goLiveAllowed ? "good" : "warn"}>{state.goLiveAllowed ? "Go-live allowed" : "Go-live blocked"}</Chip>} />{action.error && <ActionError state={action} />}{action.success && <Success text={action.success} />}<View style={s.integrationGrid}>{Object.entries(state.stages).map(([stage, status]) => <Card key={stage} style={s.integrationCard}><Text style={s.kicker}>{stage.replaceAll("_", " ").toUpperCase()}</Text><Text style={s.h2}>{status}</Text><View style={s.actionRow}><Button tone="secondary" disabled={!enabled || action.busy} onPress={() => void patchStage(stage, "ready")}>Mark ready</Button><Button tone="quiet" disabled={!enabled || action.busy} onPress={() => void patchStage(stage, "blocked")}>Block</Button></View></Card>)}</View></>;
}

function LiveEvents({ thread }: { thread: PatientThreadData | null }) {
  if (!thread) return <><SectionTitle kicker="PATIENT EVENT LEDGER" title="Open a patient first." copy="Events are fetched with the exact patient thread; no fixture audit rows are shown in production." /><EmptyState title="No patient event context" copy="Search an exact hospital identifier above." /></>;
  return <><SectionTitle kicker="PATIENT EVENT LEDGER" title={`${thread.sutraEvents.length} source-backed events`} copy="Events are append-only records returned by the Go API." /><Card style={{ padding: 0 }}>{thread.sutraEvents.length === 0 ? <EmptyState title="No SUTRA events returned" copy="The source patient exists but has no SUTRA event history." /> : thread.sutraEvents.map(e => <View style={s.liveAuditRow} key={e.id}><View style={{ flex: 1 }}><Text style={s.rowStrong}>{e.eventType}</Text><Text style={s.rowSmall}>{new Date(e.occurredAt).toLocaleString()} · {e.actorRef}</Text></View><Chip tone="blue">{e.sourceSystem}</Chip><Text style={s.rowSmall}>{e.correlationId}</Text></View>)}</Card></>;
}

function LiveField({ label, value, set, placeholder }: { label: string; value: string; set: (v: string) => void; placeholder: string }) { return <View style={s.liveField}><Text style={s.inputLabel}>{label}</Text><TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={C.muted} style={s.formInput} /></View>; }
function ActionError({ state }: { state: LiveActionState }) { return <View style={s.dangerBand}><Icon name={state.offline ? "wifi-off" : "alert-circle"} color={C.red} /><Text style={s.ruleText}>{state.error}</Text></View>; }
function Success({ text }: { text: string }) { return <View style={s.goodBand}><Icon name="check-circle" color={C.green} /><Text style={s.ruleText}>{text}</Text></View>; }

function Today({ role, go, compact }: { role: Role; go: (s: ScreenId) => void; compact: boolean }) {
  const nurse = role === "nurse";
  return <>
    <SectionTitle kicker={nurse ? "NURSE AND RECORDS · TODAY" : "ONCOLOGY OPD · TODAY"} title={nurse ? "The handoffs that need a person." : "Five patients. One thread each."} copy={nurse ? "Messages, documents and bookings are ordered by fixed service deadlines—never an AI risk score." : "OpenMRS keeps the record. SUTRA shows what is due, what arrived and where the plan is waiting."} action={<Button tone="secondary" icon="refresh-cw">Synced 1 min ago</Button>} />
    <View style={[s.metricStrip, compact && s.wrap]}>{[[nurse ? "11" : "53", nurse ? "open handoffs" : "expected today"], [nurse ? "2" : "31", nurse ? "need routing" : "papers ready"], [nurse ? "1" : "6", nurse ? "exact phrase match" : "asked for a person"]].map(([n, label]) => <View key={label} style={s.metricCell}><Text style={s.metricValue}>{n}</Text><Text style={s.metricLabel}>{label}</Text></View>)}<View style={s.metricNote}><Dot tone={nurse ? "warn" : "ok"} /><Text>{nurse ? "Next callback due in 6 min" : "Day-care reconciled at 08:58"}</Text></View></View>
    <View style={s.headingRow}><View><Text style={s.h2}>{nurse ? "Today’s handoff ledger" : "Token order"}</Text><Text style={s.sub}>Each row keeps its source and next accountable action.</Text></View><View style={s.searchBox}><Icon name="search" color={C.muted} /><TextInput placeholder="Hospital number" placeholderTextColor={C.muted} style={s.searchInput} /></View></View>
    <Card style={{ padding: 0, overflow: "hidden" }}>
      {!compact && <View style={s.tableHead}><Text>Token</Text><Text style={s.flex2}>Patient</Text><Text style={s.flex2}>Visit</Text><Text style={s.flex2}>Papers and source</Text><Text>Status</Text><Text /></View>}
      {patients.map(p => <Pressable key={p.id} onPress={() => go("patient")} style={[s.patientRow, p.name.startsWith("Meena") && s.patientSelected]}><Text style={s.token}>{p.token}</Text><View style={s.flex2}><Text style={s.rowStrong}>{p.name}</Text><Text style={s.rowSmall}>{p.id}</Text></View><View style={s.flex2}><Text style={s.rowStrong}>{p.context}</Text><Text style={s.rowSmall}>{p.time}</Text></View>{!compact && <View style={s.flex2}><Text style={s.rowStrong}>{p.papers}</Text><Text style={s.rowSmall}>OpenMRS + evidence</Text></View>}<Chip tone={p.state === "Exception" ? "bad" : p.state === "Ready" ? "good" : "neutral"}>{p.state}</Chip><Icon name="chevron-right" /></Pressable>)}
    </Card>
  </>;
}

function PatientHeader({ go }: { go: (s: ScreenId) => void }) {
  return <View style={s.patientHeader}><View style={s.patientName}><Avatar letters="MD" coral /><View style={{ flex: 1 }}><Text style={s.patientTitle}>Meena D.</Text><Text style={s.sub}>52 years · OPD-26-0917 · breast oncology</Text></View><Chip tone="good">Caregiver consent active</Chip></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>{[["patient", "Care thread"], ["dictation", "Consult & dictate"], ["plan", "Care plan"], ["prescription", "Prescription"]].map(([id, name]) => <Pressable key={id} onPress={() => go(id as ScreenId)} style={s.tab}><Text style={s.tabText}>{name}</Text></Pressable>)}</ScrollView></View>;
}
function PatientThread({ go, compact }: { go: (s: ScreenId) => void; compact: boolean }) {
  return <><PatientHeader go={go} /><View style={[s.columns, compact && s.stack]}><View style={s.mainColumn}><View style={s.headingRow}><View><Text style={s.kicker}>SOURCE-BACKED HISTORY</Text><Text style={s.h1}>Care thread</Text></View><Chip tone="blue">All sources</Chip></View><View style={s.infoBand}><Icon name="database" color={C.blueInk} /><Text>OpenMRS remains the clinical record. SUTRA does not generate a clinical summary.</Text></View><View style={s.thread}>{careEvents.map((e, i) => <View key={e.title} style={s.threadRow}><View style={s.threadRail}><View style={[s.threadDot, i === 0 && { backgroundColor: C.coral }]} />{i < careEvents.length - 1 && <View style={s.threadLine} />}</View><Text style={s.threadDate}>{e.date}</Text><View style={s.threadBody}><Text style={s.threadTitle}>{e.title}</Text><Text style={s.sub}>{e.detail}</Text><View style={{ marginTop: 8, alignSelf: "flex-start" }}><Chip tone={e.source.includes("WhatsApp") ? "blue" : "neutral"}>{e.source}</Chip></View></View></View>)}</View></View><Card style={s.sideRail}><Text style={s.kicker}>TODAY’S HANDOFF</Text><Text style={s.h1}>Cycle 4</Text><View style={s.iconLine}><Icon name="calendar" color={C.coral} /><View><Text style={s.rowStrong}>Fri, 25 Sep · 09:00</Text><Text style={s.rowSmall}>Day-care chair · BOOKED</Text></View></View><View style={s.goodBand}><Icon name="check-circle" color={C.green} /><View style={{ flex: 1 }}><Text style={s.rowStrong}>CBC filed</Text><Text style={s.rowSmall}>Doctor reads the original before deciding.</Text></View></View><Button icon="arrow-right" onPress={() => go("dictation")} style={{ width: "100%" }}>Start consultation</Button><View style={s.rule}><Icon name="lock" /><Text style={s.ruleText}><Text style={s.bold}>Clinical authority{`\n`}</Text>SUTRA gathers, drafts and files. Dr Kulkarni decides and signs.</Text></View><View style={s.divider} /><Text style={s.kicker}>LINKED CAREGIVER</Text><View style={s.iconLine}><Avatar letters="RD" /><View><Text style={s.rowStrong}>Ravi D. · son</Text><Text style={s.rowSmall}>Hindi · phone ending 8421</Text></View></View></Card></View></>;
}

function Dictation({ compact }: { compact: boolean }) {
  const draft = ["Ondansetron 8 mg oral, twice daily, for 3 days after cycle day.", "Pantoprazole 40 mg oral, once daily, for 14 days.", "Filgrastim 300 mcg subcutaneous, day 2 to day 6 after cycle 4.", "CBC between 20 and 22 October at hospital pathology before cycle 5."];
  const confidence = [96, 93, 78, 91];
  const [lines, setLines] = useState(draft);
  const [checked, setChecked] = useState(draft.map(() => false));
  const [signed, setSigned] = useState(false);
  const complete = checked.every(Boolean);
  return <><SectionTitle kicker="DOCTOR-REVIEWED DRAFT" title="Dictate, check every line, then sign." copy="The audio is not the record. Every date, medicine and dose stays a draft until the doctor confirms it." /><View style={[s.columns, compact && s.stack]}><Card style={s.mainColumn}><View style={s.audio}><Pressable style={s.play}><Icon name="play" color={C.white} /></Pressable><View style={s.wave}>{Array.from({ length: 32 }).map((_, i) => <View key={i} style={[s.waveBar, { height: 8 + (i * 11) % 26 }]} />)}</View><Text style={s.rowSmall}>00:32</Text><Chip tone="blue">IndicConformer · hi-IN</Chip></View><View style={s.transcriptMeta}><Text><Dot /> On-premises transcription</Text><Text>Draft · not signed</Text></View>{lines.map((line, i) => <View key={i} style={[s.transcriptLine, checked[i] && s.transcriptConfirmed]}><Pressable accessibilityLabel={`Confirm line ${i + 1}`} onPress={() => setChecked(checked.map((v, j) => i === j ? !v : v))} style={[s.checkbox, checked[i] && s.checkboxOn]}>{checked[i] && <Icon name="check" color={C.white} size={15} />}</Pressable><View style={{ flex: 1 }}><Text style={s.inputLabel}>Line {i + 1} · {confidence[i]}% ASR confidence</Text><TextInput multiline value={line} onChangeText={text => setLines(lines.map((v, j) => i === j ? text : v))} style={s.textArea} /></View><Pressable style={s.iconButton} accessibilityLabel={`Replay line ${i + 1}`}><Icon name="mic" /></Pressable></View>)}</Card><Card style={s.sideRail}><Text style={s.kicker}>SIGNATURE GATE</Text><Text style={s.h2}>{signed ? "Signed and versioned" : `${checked.filter(Boolean).length} of 4 confirmed`}</Text><CheckRow done text="Patient identity checked" /><CheckRow done={complete} text="All critical lines confirmed" /><CheckRow done={signed} text="Doctor passkey verified" /><View style={s.warnBand}><Icon name="alert-triangle" color={C.amber} /><Text style={s.ruleText}><Text style={s.bold}>Confidence is not correctness.{`\n`}</Text>Confirm all dates, medicine names and doses.</Text></View><Button disabled={!complete || signed} onPress={() => setSigned(true)} icon={signed ? "check" : "edit-3"}>{signed ? "Signed as Dr Kulkarni" : "Sign version 1"}</Button></Card></View></>;
}
function CheckRow({ done, text }: { done: boolean; text: string }) { return <View style={s.checkRow}><Icon name={done ? "check-circle" : "clock"} color={done ? C.green : C.muted} /><Text style={s.rowStrong}>{text}</Text></View>; }

function CarePlan({ compact }: { compact: boolean }) {
  return <><SectionTitle kicker="PATIENT PATHWAY · VERSION 3" title="Six months, one signed plan." copy="Every step has a window, an owner and an exception route. No model can change these rules." action={<Button tone="secondary" icon="clock">Version history</Button>} /><View style={[s.columns, compact && s.stack]}><Card style={s.mainColumn}><View style={s.planHeader}><View style={s.iconLine}><Avatar letters="MD" coral /><View><Text style={s.rowStrong}>Meena D. · OPD-26-0917</Text><Text style={s.rowSmall}>Adjuvant AC-T · signed 21 Sep</Text></View></View><Chip tone="good">Doctor signed</Chip></View>{pathway.map((step, i) => <View key={step.title} style={s.planRow}><View style={[s.planNode, step.state === "done" && s.planNodeDone, step.state === "next" && s.planNodeNext]}><Text style={s.planNodeText}>{step.state === "done" ? "✓" : i + 1}</Text></View><View style={{ flex: 1 }}><Text style={s.rowStrong}>{step.title}</Text><Text style={s.rowSmall}>{step.when}</Text></View><Chip tone={step.state === "next" ? "warn" : "neutral"}>{step.owner}</Chip></View>)}<View style={s.infoBand}><Icon name="alert-circle" color={C.blueInk} /><Text>If a CBC is not filed by the window close, create a nurse callback. No automatic clinical decision.</Text></View></Card><Card style={s.sideRail}><Text style={s.kicker}>FAMILY PREVIEW · HINDI</Text><Text style={s.h2}>अगले तीन कदम</Text>{[["1", "शुक्रवार, 25 सितंबर", "सुबह 9 बजे Day-care, Cycle 4"], ["2", "20–22 अक्टूबर", "Cycle 5 से पहले CBC"], ["3", "23–25 अक्टूबर", "Cycle 5 Day-care"]].map(x => <View key={x[0]} style={s.familyStep}><View style={s.planNode}><Text>{x[0]}</Text></View><View><Text style={s.rowStrong}>{x[1]}</Text><Text style={s.rowSmall}>{x[2]}</Text></View></View>)}<View style={s.rule}><Icon name="message-circle" /><Text style={s.ruleText}>Families receive exact signed lines through approved WhatsApp utility templates.</Text></View><Button tone="secondary">Preview English</Button><Button>Create revised version</Button></Card></View></>;
}

function Prescription({ compact }: { compact: boolean }) {
  const [signed, setSigned] = useState(false);
  const meds = [["Ondansetron", "8 mg", "Oral · twice daily", "3 days"], ["Pantoprazole", "40 mg", "Oral · once daily", "14 days"], ["Filgrastim", "300 mcg", "SC · days 2–6", "5 days"]];
  return <><SectionTitle kicker="DOCTOR AUTHORING · NOT OCR" title="Prescription awaiting signature." copy="Only this doctor-authored, signed version can cross the pharmacy interface. Report OCR never creates a prescription." /><View style={[s.columns, compact && s.stack]}><Card style={s.mainColumn}><View style={s.rxHead}><View><Text style={s.h2}>District Hospital Oncology</Text><Text style={s.sub}>Meena D. · OPD-26-0917 · 25 Sep 2026</Text></View><Text style={s.rx}>Rx</Text></View>{meds.map((m, i) => <View key={m[0]} style={s.medRow}><Text style={s.medNumber}>{i + 1}</Text><View style={{ flex: 2 }}><Text style={s.inputLabel}>Medicine</Text><TextInput style={s.lineInput} defaultValue={m[0]} /></View><View style={{ flex: 1 }}><Text style={s.inputLabel}>Dose</Text><TextInput style={s.lineInput} defaultValue={m[1]} /></View><View style={{ flex: 2 }}><Text style={s.inputLabel}>Route</Text><TextInput style={s.lineInput} defaultValue={m[2]} /></View><View style={{ flex: 1 }}><Text style={s.inputLabel}>Duration</Text><TextInput style={s.lineInput} defaultValue={m[3]} /></View></View>)}<Text style={s.inputLabel}>Instructions to pharmacy</Text><TextInput multiline style={s.textArea} defaultValue="Dispense only against this signed prescription. Contact oncology OPD if stock is unavailable." /></Card><Card style={s.sideRail}><Text style={s.kicker}>FHIR HANDOFF</Text><Text style={s.h2}>{signed ? "Accepted by pharmacy" : "Not sent"}</Text>{["Doctor signature", "FHIR MedicationRequest", "Pharmacy acknowledgement"].map((x, i) => <View style={s.routeStep} key={x}><View style={[s.planNode, signed && s.planNodeDone]}><Text style={s.planNodeText}>{signed ? "✓" : i + 1}</Text></View><Text style={s.rowStrong}>{x}</Text></View>)}<View style={s.rule}><Icon name="lock" /><Text style={s.ruleText}>The adapter cannot sign. Your passkey creates the clinical record first.</Text></View><Button disabled={signed} onPress={() => setSigned(true)} icon={signed ? "check" : "send"}>{signed ? "Signed · ACK RX-4418" : "Sign and send"}</Button></Card></View></>;
}

function OcrReview({ compact }: { compact: boolean }) {
  const fields = [["Patient", "Meena D.", 98], ["Hospital no.", "OPD-26-0917", 96], ["Report date", "24 Sep 2026", 71], ["Haemoglobin", "10.8 g/dL", 88], ["Absolute neutrophil count", "1.9", 74], ["Platelets", "210", 92]] as const;
  const [confirmed, setConfirmed] = useState(fields.map((_, i) => i < 2));
  return <><SectionTitle kicker="RECORDS DESK · SOURCE-PRESERVING OCR" title="Confirm the page, not an interpretation." copy="OCR copies visible text into a draft. A person checks it against the original; no value is coloured, scored or interpreted." action={<Button tone="secondary" icon="upload">Add document</Button>} /><View style={[s.ocrColumns, compact && s.stack]}><Card style={s.documentQueue}><View style={s.headingRow}><Text style={s.h2}>Review queue</Text><Chip tone="warn">4</Chip></View>{[["Meena D.", "CBC · 2 pages"], ["Ramesh P.", "Discharge summary"], ["Asha K.", "Echo report"], ["Unknown", "Register page"]].map((d, i) => <View key={d[0]} style={[s.docRow, i === 0 && s.docSelected]}><Icon name="file-text" /><View style={{ flex: 1 }}><Text style={s.rowStrong}>{d[0]}</Text><Text style={s.rowSmall}>{d[1]}</Text></View><Icon name="chevron-right" /></View>)}</Card><Card style={s.reportCard}><View style={s.reportToolbar}><Text style={s.rowStrong}>Original · page 1 of 2</Text><Chip>100%</Chip></View><View style={s.paper}><Text style={s.reportTiny}>DISTRICT HOSPITAL · PATHOLOGY LABORATORY</Text><Text style={s.reportTitle}>HAEMATOLOGY REPORT</Text><View style={s.reportMeta}><Text>Patient: Meena D.</Text><Text>UHID: OPD-26-0917</Text><Text>24/09/2026</Text></View>{[["Haemoglobin", "10.8", "g/dL"], ["Absolute neutrophil count", "1.9", "10³/µL"], ["Platelets", "210", "10³/µL"], ["Total leucocyte count", "4.7", "10³/µL"]].map(r => <View style={s.reportRow} key={r[0]}>{r.map(v => <Text key={v}>{v}</Text>)}</View>)}</View></Card><Card style={s.ocrPanel}><View style={s.headingRow}><View><Text style={s.h2}>OCR draft</Text><Text style={s.rowSmall}>PaddleOCR-hi-en · on premises</Text></View><Chip tone="warn">Unverified</Chip></View>{fields.map((f, i) => <View key={f[0]} style={[s.ocrField, confirmed[i] && { borderColor: "#A6D4BA" }]}><Text style={s.inputLabel}>{f[0]} · {f[2]}% confidence</Text><View style={s.fieldRow}><TextInput style={s.fieldInput} defaultValue={String(f[1])} /><Pressable onPress={() => setConfirmed(confirmed.map((v, j) => i === j ? !v : v))} style={[s.confirmBtn, confirmed[i] && { backgroundColor: C.green }]}><Text style={[s.confirmText, confirmed[i] && { color: C.white }]}>{confirmed[i] ? "✓" : "Confirm"}</Text></Pressable></View></View>)}<View style={s.warnBand}><Icon name="alert-triangle" color={C.amber} /><Text style={s.ruleText}>Values are not interpreted. The doctor reads the original report.</Text></View><Button disabled={!confirmed.every(Boolean)}>File verified report</Button></Card></View></>;
}

function RoutingInbox({ compact }: { compact: boolean }) {
  const [selected, setSelected] = useState(0);
  const item = inbox[selected];
  return <><SectionTitle kicker="REAL WHATSAPP CHANNEL · CHATWOOT HANDOFF" title="A person answers every clinical question." copy="JEV suggests a bounded operational topic. Clinician-authored rules choose a queue. Symptoms, medicines and uncertainty always defer." action={<Button tone="secondary" icon="external-link">Open Chatwoot</Button>} /><View style={[s.routingColumns, compact && s.stack]}><Card style={s.routingList}>{inbox.map((m, i) => <Pressable key={m.id} onPress={() => setSelected(i)} style={[s.messageRow, selected === i && s.docSelected]}><Avatar letters={m.patient.split(" ").map(x => x[0]).join("")} /><View style={{ flex: 1 }}><View style={s.spaceBetween}><Text style={s.rowStrong}>{m.patient}</Text><Text style={s.rowSmall}>{m.age}</Text></View><Text style={s.messageText}>{m.text}</Text><Text style={s.rowSmall}>{m.route}</Text></View></Pressable>)}</Card><Card style={s.handoffPanel}><View style={s.headingRow}><View><Text style={s.kicker}>{item.id} · WHATSAPP CLOUD WEBHOOK</Text><Text style={s.h1}>{item.patient}</Text><Text style={s.sub}>Linked caregiver · consent active</Text></View><Chip tone="good">Open in Chatwoot</Chip></View><View style={s.messageEvidence}><Icon name="message-circle" color={C.green} /><View style={{ flex: 1 }}><Text style={s.messageBig}>{item.text}</Text><Text style={s.sub}>{item.translation}</Text></View></View>{item.tone === "red" && <View style={s.dangerBand}><Icon name="phone-call" color={C.red} /><Text style={s.ruleText}><Text style={s.bold}>Exact clinician-authored phrase matched.{`\n`}</Text>Fixed safety template delivered and duty nurse paged. This is not a severity score.</Text></View>}<View style={[s.decisionGrid, compact && s.wrap]}>{[["Suggested topic", item.tag], ["Confidence / rule", item.confidence], ["Signed route", item.route]].map(d => <View key={d[0]}><Text style={s.inputLabel}>{d[0]}</Text><Text style={s.rowStrong}>{d[1]}</Text></View>)}</View><View style={s.quote}><Icon name="shield" color={C.green} /><View style={{ flex: 1 }}><Text style={s.inputLabel}>SIGNED PLAN EXCERPT · DR KULKARNI · V3</Text><Text style={s.quoteText}>“CBC between 20 and 22 October at hospital pathology before cycle 5.”</Text></View></View><View style={s.actionRow}><Button icon="external-link">Accept in Chatwoot</Button><Button tone="secondary">Send to doctor</Button><Button tone="quiet">Change route</Button></View><Text style={s.boundary}>🔒 No reply composer is shown here. Clinical replies are human-sent from Chatwoot and logged back to SUTRA.</Text></Card><Card style={s.routingMeta}><Text style={s.kicker}>ROUTING, NOT DIAGNOSIS</Text><Text style={s.h2}>No severity score</Text>{["Identity linked", "Consent active", "Safety status visible", "Human override logged"].map(x => <CheckRow key={x} done text={x} />)}<View style={s.divider} />{[["Model", "JEV · ops-intent-v2"], ["Rule set", "ONC-MSG v7"], ["Data mode", "Transient · no training"]].map(x => <View style={s.metaRow} key={x[0]}><Text style={s.rowSmall}>{x[0]}</Text><Text style={s.rowStrong}>{x[1]}</Text></View>)}</Card></View></>;
}

function Analytics({ compact }: { compact: boolean }) {
  const bars = [["CBC before cycle", 82], ["Chemo cycle visit", 89], ["Surgery after OPD", 77], ["Echo before cycle 5", 71], ["RT referral follow-up", 64], ["3-month follow-up", 58]] as const;
  return <><SectionTitle kicker="ADMIN · ONCOLOGY · LAST 90 DAYS" title="Can the hospital follow the plan through?" copy="Every number resolves to dated events and their source. The question box counts and lists; it never scores a patient." action={<Button tone="secondary" icon="download">Export evidence</Button>} /><View style={[s.analyticsMetrics, compact && s.stack]}><View style={s.primaryMetric}><Text style={s.kickerLight}>PRIMARY PILOT MEASURE</Text><Text style={s.bigNumber}>71%</Text><Text style={s.metricLead}>of planned next steps completed inside the window the doctor set</Text><Text style={s.metricFoot}>Baseline 52% · 913 eligible steps</Text></View>{[["39 / 41", "slots confirmed by source", "2 exceptions resolved"], ["913", "patients with ABHA", "of 1,284 active"], ["95 min", "staff chasing per 100", "baseline 210 min"]].map(x => <Card key={x[1]} style={s.smallMetric}><Text style={s.h1}>{x[0]}</Text><Text style={s.rowStrong}>{x[1]}</Text><Text style={s.rowSmall}>{x[2]}</Text></Card>)}</View><View style={[s.analyticsGrid, compact && s.stack]}><Card style={s.chartPanel}><Text style={s.h2}>Completion inside signed window</Text><Text style={s.sub}>By pathway step · source-backed</Text><View style={s.barList}>{bars.map(([name, v]) => <View style={s.barRow} key={name}><Text style={s.barLabel}>{name}</Text><View style={s.barTrack}><View style={[s.barFill, { width: `${v}%` }]} /></View><Text style={s.barValue}>{v}%</Text></View>)}</View></Card><Card style={s.bookingPanel}><Text style={s.h2}>Bookings this week</Text><Text style={s.sub}>Each transition is confirmed by the source scheduler.</Text><View style={s.funnel}>{[["41", "requested"], ["39", "BOOKED"], ["39", "checked back"], ["2", "exception"]].map((x, i) => <View key={x[1]} style={s.funnelStep}><View style={[s.funnelDot, i === 3 && { backgroundColor: C.coral }]}><Text style={s.funnelNumber}>{x[0]}</Text></View><Text style={s.rowSmall}>{x[1]}</Text></View>)}</View></Card><Card style={s.questionPanel}><Text style={s.kicker}>ASK THE EVENT LEDGER</Text><Text style={s.h2}>Who was told to come back for surgery and has not, thirty days on?</Text><View style={s.answer}><Text style={s.h1}>38 of 214</Text><Text style={s.sub}>patients have no admission or visit 30 days on.</Text><Text style={s.query}>pathway_step = surgery · planned ≥30d · no encounter · sources: event log + OpenMRS</Text></View><View style={s.askRow}><TextInput placeholder="Ask another count or list question" style={s.askInput} /><Button>Ask</Button></View></Card></View></>;
}

function Integrations({ compact }: { compact: boolean }) {
  const items: Array<[IconName, string, string, string, "good" | "warn"]> = [["database", "OpenMRS Mini", "Identity + clinical record", "Read-only · FHIR R4", "good"], ["calendar", "Appointments", "Authoritative booking", "Reconciled 08:58", "good"], ["message-circle", "WhatsApp Cloud API", "Real family channel", "1 template awaiting approval", "warn"], ["inbox", "Chatwoot", "Human inbox + replies", "Webhook 4 min ago", "good"], ["sliders", "JEV", "Bounded operational topic", "Adapter ready · API key required", "warn"], ["file-text", "OCR", "Source transcription", "On premises", "good"], ["mic", "IndicConformer", "Dictation draft", "On premises", "good"], ["cloud", "ABDM bridge", "Consent + national record", "Sandbox", "warn"]];
  return <><SectionTitle kicker="HOSPITAL BOUNDARY · DEPLOYMENT HEALTH" title="Every connection names its authority." copy="SUTRA reads the record, requests bookings and logs handoffs. Adapters cannot sign a pathway or send a clinical reply." action={<Button tone="secondary" icon="refresh-cw">Test all</Button>} /><View style={[s.integrationGrid, compact && s.stack]}>{items.map(([icon, name, purpose, detail, tone]) => <Card key={name} style={s.integrationCard}><View style={s.integrationIcon}><Icon name={icon} color={C.navy} /></View><View style={{ flex: 1 }}><Text style={s.h2}>{name}</Text><Text style={s.sub}>{purpose}</Text></View><Chip tone={tone}>{tone === "good" ? "Connected" : "Attention"}</Chip><Text style={s.rowSmall}>{detail}</Text></Card>)}</View><View style={[s.columns, compact && s.stack]}><Card style={s.mainColumn}><View style={s.headingRow}><View><Text style={s.kicker}>WHATSAPP BUSINESS CLOUD API</Text><Text style={s.h2}>Approved utility templates</Text></View><Chip tone="good">Real channel</Chip></View>{[["sutra_booking_confirmed", "hi, en", "Approved", "Delivered · 12 min"], ["sutra_next_three_steps", "hi, en", "Approved", "Read · 22 Sep"], ["sutra_safety_notice", "hi, en, mr", "Approved", "Delivered · 4 min"], ["sutra_report_filed", "hi", "In review", "Submitted · 29 Sep"]].map(x => <View style={s.templateRow} key={x[0]}><Text style={[s.rowStrong, { flex: 2 }]}>{x[0]}</Text><Text style={s.flex1}>{x[1]}</Text><Chip tone={x[2] === "Approved" ? "good" : "warn"}>{x[2]}</Chip><Text style={[s.rowSmall, s.flex1]}>{x[3]}</Text></View>)}</Card><Card style={s.sideRail}><Text style={s.kicker}>DELIVERY EVENT</Text><Text style={s.h2}>Meta callback verified</Text>{[["Message ID", "wamid…9f02"], ["Template", "booking_confirmed · hi"], ["Accepted", "17:44:02"], ["Delivered", "17:44:08"], ["Read", "18:06:41"]].map(x => <View style={s.metaRow} key={x[0]}><Text style={s.rowSmall}>{x[0]}</Text><Text style={s.rowStrong}>{x[1]}</Text></View>)}<View style={s.goodBand}><Icon name="shield" color={C.green} /><Text>Webhook signature verified.</Text></View></Card></View></>;
}

function AuditTrail({ compact }: { compact: boolean }) {
  return <>
    <SectionTitle kicker="APPEND-ONLY EVIDENCE" title="Every handoff keeps its source." copy="Corrections create new events; they never overwrite the original actor, model, consent or source identifier." action={<Button tone="secondary" icon="download">Export CSV</Button>} />
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View style={s.auditToolbar}><View style={s.searchBox}><Icon name="search" color={C.muted} /><TextInput placeholder="Patient, event or correlation ID" style={s.searchInput} /></View><Chip>30 Sep 2026</Chip></View>
      {!compact && <View style={s.auditHead}>{["Occurred", "Event", "Actor", "Source", "Correlation"].map(x => <Text style={s.auditCell} key={x}>{x}</Text>)}</View>}
      {auditEvents.map(row => <View key={row[4]} style={s.auditRow}>{compact ? <><Text style={s.rowStrong}>{row[1]}</Text><Text style={s.rowSmall}>{row[0]} · {row[3]} · {row[2]}</Text></> : row.map(x => <Text style={s.auditCell} key={x}>{x}</Text>)}</View>)}
    </Card>
    <View style={s.auditBoundary}><Icon name="lock" color={C.white} size={24} /><View style={{ flex: 1 }}><Text style={s.auditTitle}>Protected actions</Text><Text style={s.auditCopy}>MCP and coding tools may inspect, test and map. They cannot write the clinical record, sign a pathway or message a family.</Text></View></View>
  </>;
}

function Onboarding({ compact }: { compact: boolean }) {
  const gates = [["1", "Sign off", "Complete", "Named admin + clinical approver", "done"], ["2", "Map source", "Complete", "OpenMRS services mapped", "done"], ["3", "Shadow", "Day 7 of 10", "39 / 41 outcomes matched", "active"], ["4", "Go live", "Locked", "Approver signature required", "locked"]];
  return <><SectionTitle kicker="HOSPITAL ONBOARDING · DISTRICT HOSPITAL" title="Read first. Shadow next. Go live last." copy="The hospital keeps authority at every gate. Nothing writes back until the source owner and clinical approver sign." /><View style={[s.gates, compact && s.stack]}>{gates.map(g => <Card key={g[0]} style={[s.gate, g[4] === "active" && s.gateActive]}><View style={[s.gateNumber, g[4] === "done" && s.planNodeDone]}><Text style={s.planNodeText}>{g[4] === "done" ? "✓" : g[0]}</Text></View><Text style={s.kicker}>GATE {g[0]}</Text><Text style={s.h2}>{g[1]}</Text><Text style={[s.rowStrong, g[4] === "active" && { color: C.coral }]}>{g[2]}</Text><Text style={s.rowSmall}>{g[3]}</Text></Card>)}</View><View style={[s.onboardGrid, compact && s.stack]}><Card style={s.mainColumn}><View style={s.headingRow}><View><Text style={s.kicker}>CURRENT GATE</Text><Text style={s.h2}>Shadow booking comparison</Text></View><Chip tone="warn">3 days remaining</Chip></View><View style={s.comparison}>{[["41", "SUTRA would request"], ["39", "Scheduler booked"], ["2", "Exceptions"]].map(x => <View key={x[1]}><Text style={s.h1}>{x[0]}</Text><Text style={s.rowSmall}>{x[1]}</Text></View>)}</View><CheckRow done text="Read-only feed stable for 7 days" /><CheckRow done text="Booking mapping approved" /><CheckRow done text="No family messages in shadow mode" /><CheckRow done={false} text="Clinical approver review due 3 Oct" /><Button tone="secondary">Open shadow report</Button></Card><Card style={s.onboardMap}><Text style={s.kicker}>DATA MAP</Text><Text style={s.h2}>OpenMRS Mini</Text>{[["Patient identifier", "patient.identifier"], ["Encounter source", "FHIR R4 Encounter"], ["Appointments", "/ws/rest/v1/appointments"], ["Consent", "SUTRA event ledger"]].map(x => <View style={s.mappingRow} key={x[0]}><View><Text style={s.rowSmall}>{x[0]}</Text><Text style={s.rowStrong}>{x[1]}</Text></View><Icon name="check" color={C.green} /></View>)}</Card><View style={s.runbook}><Icon name="book-open" color={C.coral} size={28} /><Text style={s.kickerLight}>HANDOVER RUNBOOK</Text><Text style={s.runbookTitle}>Hospital-operated after day 30</Text>{["Nightly reconciliation", "Failed booking recovery", "Routing rule approvals", "Consent revocation", "Weekly KPI evidence"].map(x => <Text style={s.runbookItem} key={x}>✓  {x}</Text>)}<Button style={{ marginTop: 12 }}>Review runbook</Button></View></View></>;
}

const shadow = Platform.select({ web: { boxShadow: "0 12px 30px rgba(25,31,54,.08)" }, default: { shadowColor: "#151C3B", shadowOpacity: .08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 } }) as ViewStyle;
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.paper }, shell: { flex: 1, flexDirection: "row" }, shellCompact: { flexDirection: "column" },
  sidebar: { width: 250, backgroundColor: C.navy, padding: 22, zIndex: 20 }, mobileHeader: { width: "100%", height: 60, paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  menuButton: { minHeight: 44, maxWidth: 190, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: "#46507A" }, menuButtonText: { color: C.white, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  mobileMenu: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, padding: 12, gap: 10, ...shadow, zIndex: 10 }, mobileMenuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 }, mobileMenuItem: { width: "48.5%", minHeight: 46, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 12, borderRadius: 4, backgroundColor: C.paper }, mobileMenuItemActive: { backgroundColor: "#FFEDEA" }, mobileMenuText: { color: C.navy, fontSize: 13, fontWeight: "700", flexShrink: 1 }, mobileMenuFoot: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, gap: 4 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 }, brandImage: { width: 40, height: 34 }, brandName: { color: C.white, fontSize: 23, fontWeight: "800", letterSpacing: 2 }, brandSub: { color: "#AEB5CB", fontSize: 10 },
  demoFlag: { marginTop: 26, padding: 12, borderWidth: 1, borderColor: "#394160", borderRadius: 4 }, demoFlagText: { color: "#FFD0CB", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, demoFlagSub: { color: "#AEB5CB", fontSize: 11, marginTop: 3 }, nav: { marginTop: 24, gap: 4, flex: 1 }, navItem: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderRadius: 4 }, navActive: { backgroundColor: C.paper }, navText: { color: "#C0C5D4", fontSize: 14, fontWeight: "600" }, navTextActive: { color: C.navy },
  roleWrap: { marginTop: "auto", position: "relative" }, roleButton: { minWidth: 205, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#394160" }, roleSmall: { color: "#8F98B2", fontSize: 8, fontWeight: "800", letterSpacing: 1 }, roleName: { color: C.white, fontSize: 13, fontWeight: "700", marginTop: 2 }, roleMenu: { position: "absolute", left: 0, right: 0, bottom: 58, backgroundColor: C.white, borderRadius: 4, padding: 5, ...shadow }, roleMenuMobile: { left: undefined, right: 0, width: 230, bottom: undefined, top: 54 }, roleMenuItem: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 }, roleMenuText: { color: C.ink, fontSize: 13, fontWeight: "600" },
  main: { flex: 1, minWidth: 0 }, topbar: { height: 62, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, topbarText: { color: C.ink, fontWeight: "700", flexShrink: 1 }, topbarSearch: { flex: 1, maxWidth: 520, marginHorizontal: 24 }, health: { flexDirection: "row", gap: 18 }, healthItem: { color: C.muted, fontSize: 12 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#39A56C", display: "flex" }, dotWarn: { backgroundColor: "#E6A23C" }, dotBad: { backgroundColor: C.red },
  mobileNavScroll: { flexGrow: 0, flexShrink: 0, height: 54, maxHeight: 54 }, mobileNav: { backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line, paddingHorizontal: 12, height: 54, alignItems: "center", gap: 4 }, mobileNavItem: { height: 38, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 4 }, mobileNavActive: { backgroundColor: C.blue }, mobileNavText: { color: C.muted, fontSize: 12, fontWeight: "700" },
  scroll: { flex: 1 }, content: { paddingHorizontal: 34, paddingTop: 30, paddingBottom: 60, maxWidth: 1500, width: "100%", alignSelf: "center" }, contentCompact: { paddingHorizontal: 16, paddingTop: 22 },
  sectionTitle: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 26 }, sectionTitleCopy: { flex: 1, maxWidth: 850 }, kicker: { color: C.coral, fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 8 }, kickerLight: { color: "#FFB5AE", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" }, pageTitle: { color: C.navy, fontSize: 35, lineHeight: 41, fontWeight: "800", letterSpacing: -.8 }, h1: { color: C.navy, fontSize: 28, lineHeight: 34, fontWeight: "800" }, h2: { color: C.navy, fontSize: 19, lineHeight: 24, fontWeight: "800" }, lead: { color: C.muted, fontSize: 15, lineHeight: 23, marginTop: 8, maxWidth: 780 }, sub: { color: C.muted, fontSize: 13, lineHeight: 19 }, bold: { fontWeight: "800", color: C.ink },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 4, backgroundColor: C.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }, buttonSecondary: { backgroundColor: C.white, borderWidth: 1, borderColor: "#C8C7C1" }, buttonQuiet: { backgroundColor: "transparent" }, buttonText: { color: C.white, fontSize: 13, fontWeight: "800" }, buttonTextDark: { color: C.navy }, disabled: { opacity: .42 },
  card: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 20, ...shadow }, chip: { backgroundColor: C.pale, minHeight: 26, paddingHorizontal: 9, alignItems: "center", justifyContent: "center", borderRadius: 13, alignSelf: "flex-start" }, chipGood: { backgroundColor: C.mint }, chipWarn: { backgroundColor: C.amberPale }, chipBad: { backgroundColor: C.redPale }, chipBlue: { backgroundColor: C.blue }, chipText: { color: C.ink, fontSize: 10, fontWeight: "800" },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" }, avatarCoral: { backgroundColor: C.coral }, avatarText: { color: C.navy, fontWeight: "800", fontSize: 11 },
  metricStrip: { backgroundColor: C.navy, flexDirection: "row", alignItems: "stretch", marginBottom: 28, borderRadius: 5, overflow: "hidden" }, wrap: { flexWrap: "wrap" }, metricCell: { minWidth: 150, flex: 1, padding: 18, borderRightWidth: 1, borderRightColor: "#3B4260" }, metricValue: { color: C.white, fontSize: 25, fontWeight: "800" }, metricLabel: { color: "#BDC3D5", fontSize: 11, marginTop: 3 }, metricNote: { flex: 1.4, minWidth: 220, padding: 18, backgroundColor: C.mint, flexDirection: "row", alignItems: "center", gap: 9 }, metricLabel2: { color: C.navy },
  headingRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 15 }, searchBox: { minWidth: 230, height: 42, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 4, paddingHorizontal: 12 }, searchInput: { flex: 1, fontSize: 13, color: C.ink, outlineStyle: "none" } as any,
  tableHead: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, backgroundColor: C.pale }, patientRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.line }, patientSelected: { borderLeftWidth: 4, borderLeftColor: C.coral, backgroundColor: "#FFFDFC" }, token: { color: C.navy, fontWeight: "800", width: 54 }, flex1: { flex: 1 }, flex2: { flex: 2 }, rowStrong: { color: C.ink, fontSize: 13, lineHeight: 18, fontWeight: "700" }, rowSmall: { color: C.muted, fontSize: 11, lineHeight: 16 },
  patientHeader: { backgroundColor: C.white, marginHorizontal: -34, marginTop: -30, marginBottom: 26, paddingHorizontal: 34, paddingTop: 24, borderBottomWidth: 1, borderBottomColor: C.line }, patientName: { flexDirection: "row", alignItems: "center", gap: 12 }, patientTitle: { color: C.navy, fontSize: 26, fontWeight: "800" }, tabs: { marginTop: 20, gap: 20 }, tab: { paddingVertical: 13 }, tabText: { color: C.navy, fontSize: 13, fontWeight: "700" },
  columns: { flexDirection: "row", alignItems: "flex-start", gap: 22 }, stack: { flexDirection: "column" }, mainColumn: { flex: 1, width: "100%" }, sideRail: { width: 320, gap: 15 }, infoBand: { backgroundColor: C.blue, padding: 13, flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 16 }, thread: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, padding: 22 }, threadRow: { flexDirection: "row", minHeight: 102 }, threadRail: { width: 24, alignItems: "center" }, threadDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.navy, marginTop: 4, zIndex: 2 }, threadLine: { width: 1, flex: 1, backgroundColor: C.line }, threadDate: { width: 120, color: C.muted, fontSize: 11 }, threadBody: { flex: 1, paddingBottom: 22 }, threadTitle: { color: C.navy, fontSize: 15, fontWeight: "800", marginBottom: 4 }, iconLine: { flexDirection: "row", alignItems: "center", gap: 10 }, goodBand: { padding: 13, backgroundColor: C.mint, flexDirection: "row", gap: 10, alignItems: "center" }, warnBand: { padding: 13, backgroundColor: C.amberPale, flexDirection: "row", gap: 10, alignItems: "flex-start" }, dangerBand: { padding: 13, backgroundColor: C.redPale, flexDirection: "row", gap: 10, alignItems: "flex-start", marginVertical: 14 }, rule: { paddingTop: 13, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", gap: 10 }, ruleText: { flex: 1, color: C.ink, fontSize: 12, lineHeight: 18 }, divider: { height: 1, backgroundColor: C.line, marginVertical: 5 },
  audio: { minHeight: 68, backgroundColor: C.navy, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 15, borderRadius: 4 }, play: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.coral, alignItems: "center", justifyContent: "center" }, wave: { flex: 1, flexDirection: "row", alignItems: "center", gap: 3, height: 40 }, waveBar: { width: 2, backgroundColor: "#AAB2D0" }, transcriptMeta: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12 }, transcriptLine: { borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 14, flexDirection: "row", gap: 12, alignItems: "flex-start" }, transcriptConfirmed: { backgroundColor: "#F6FCF8" }, checkbox: { width: 26, height: 26, borderWidth: 2, borderColor: "#9AA0B0", borderRadius: 3, alignItems: "center", justifyContent: "center", marginTop: 20 }, checkboxOn: { backgroundColor: C.green, borderColor: C.green }, inputLabel: { color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: .5, marginBottom: 5 }, textArea: { minHeight: 58, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 10, color: C.ink, fontSize: 13, textAlignVertical: "top", outlineStyle: "none" } as any, iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line, borderRadius: 4, marginTop: 16 }, checkRow: { flexDirection: "row", alignItems: "center", gap: 9, minHeight: 34 },
  planHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: C.line }, planRow: { minHeight: 68, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: "row", alignItems: "center", gap: 12 }, planNode: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.pale, alignItems: "center", justifyContent: "center" }, planNodeDone: { backgroundColor: C.green }, planNodeNext: { backgroundColor: C.coral }, planNodeText: { color: C.white, fontSize: 11, fontWeight: "800" }, familyStep: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 10 },
  rxHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 18, borderBottomWidth: 2, borderBottomColor: C.navy }, rx: { color: C.coral, fontSize: 34, fontWeight: "800" }, medRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.line }, medNumber: { width: 24, color: C.coral, fontWeight: "800" }, lineInput: { borderBottomWidth: 1, borderBottomColor: C.line, color: C.ink, fontSize: 12, paddingVertical: 6, outlineStyle: "none" } as any, routeStep: { flexDirection: "row", gap: 10, alignItems: "center", minHeight: 50 },
  ocrColumns: { flexDirection: "row", gap: 16, alignItems: "flex-start" }, documentQueue: { width: 230, padding: 12 }, docRow: { minHeight: 64, padding: 10, flexDirection: "row", gap: 9, alignItems: "center", borderTopWidth: 1, borderTopColor: C.line }, docSelected: { backgroundColor: C.blue, borderLeftWidth: 3, borderLeftColor: C.coral }, reportCard: { flex: 1, backgroundColor: "#E9E6DF" }, reportToolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 }, paper: { minHeight: 470, backgroundColor: C.white, padding: 28, ...shadow }, reportTiny: { textAlign: "center", fontSize: 8, letterSpacing: 1 }, reportTitle: { textAlign: "center", fontSize: 15, fontWeight: "800", marginVertical: 8 }, reportMeta: { paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.ink, gap: 4 }, reportRow: { minHeight: 42, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, ocrPanel: { width: 340 }, ocrField: { borderLeftWidth: 3, borderLeftColor: C.line, paddingLeft: 10, marginBottom: 10 }, fieldRow: { flexDirection: "row" }, fieldInput: { flex: 1, borderWidth: 1, borderColor: C.line, paddingHorizontal: 9, height: 38, color: C.ink, outlineStyle: "none" } as any, confirmBtn: { minWidth: 62, height: 38, alignItems: "center", justifyContent: "center", backgroundColor: C.pale }, confirmText: { color: C.navy, fontSize: 10, fontWeight: "800" },
  routingColumns: { flexDirection: "row", gap: 16, alignItems: "flex-start" }, routingList: { width: 260, padding: 8 }, messageRow: { minHeight: 92, flexDirection: "row", gap: 9, padding: 10, borderBottomWidth: 1, borderBottomColor: C.line }, messageText: { color: C.ink, fontSize: 13, fontWeight: "600", marginVertical: 3 }, handoffPanel: { flex: 1 }, messageEvidence: { padding: 18, backgroundColor: "#ECF7EF", flexDirection: "row", gap: 12, marginVertical: 12 }, messageBig: { color: C.ink, fontSize: 17, fontWeight: "700" }, decisionGrid: { flexDirection: "row", backgroundColor: C.pale, padding: 14, gap: 22 }, quote: { padding: 14, flexDirection: "row", gap: 10, borderWidth: 1, borderColor: "#B8D9C7", backgroundColor: "#F8FCF9", marginVertical: 14 }, quoteText: { color: C.ink, fontSize: 14, fontStyle: "italic", lineHeight: 21 }, actionRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" }, boundary: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 14 }, routingMeta: { width: 245 }, spaceBetween: { flexDirection: "row", justifyContent: "space-between" }, metaRow: { flexDirection: "row", justifyContent: "space-between", minHeight: 34, alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.line },
  analyticsMetrics: { flexDirection: "row", gap: 14, marginBottom: 16 }, primaryMetric: { width: 330, backgroundColor: C.navy, padding: 22, borderRadius: 5 }, bigNumber: { color: C.white, fontSize: 52, fontWeight: "800", marginVertical: 6 }, metricLead: { color: C.white, fontSize: 15, lineHeight: 21, fontWeight: "700" }, metricFoot: { color: "#B9C0D4", fontSize: 11, marginTop: 10 }, smallMetric: { flex: 1, minWidth: 175 }, analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 }, chartPanel: { flex: 2, minWidth: 380 }, bookingPanel: { flex: 1, minWidth: 300 }, questionPanel: { width: "100%" }, barList: { marginTop: 18, gap: 13 }, barRow: { flexDirection: "row", alignItems: "center", gap: 10 }, barLabel: { color: C.ink, fontSize: 11, width: 140 }, barTrack: { flex: 1, height: 9, backgroundColor: C.pale }, barFill: { height: 9, backgroundColor: C.coral }, barValue: { width: 34, color: C.navy, fontWeight: "800", fontSize: 11 }, funnel: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginTop: 30 }, funnelStep: { alignItems: "center", gap: 7 }, funnelDot: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" }, funnelNumber: { color: C.white, fontWeight: "800", fontSize: 16 }, answer: { marginTop: 15, borderLeftWidth: 4, borderLeftColor: C.coral, paddingLeft: 16 }, query: { marginTop: 10, color: C.muted, fontSize: 9 }, askRow: { flexDirection: "row", marginTop: 16, gap: 8 }, askInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 4, paddingHorizontal: 12, outlineStyle: "none" } as any,
  integrationGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 18 }, integrationCard: { width: "24%", minWidth: 240, minHeight: 190, gap: 10 }, integrationIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: C.blue }, templateRow: { minHeight: 52, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", alignItems: "center", gap: 12 }, auditToolbar: { padding: 15, flexDirection: "row", justifyContent: "space-between" }, auditHead: { minHeight: 40, paddingHorizontal: 16, backgroundColor: C.pale, flexDirection: "row", alignItems: "center" }, auditRow: { minHeight: 54, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", alignItems: "center" }, auditCell: { flex: 1, color: C.ink, fontSize: 11 }, auditBoundary: { marginTop: 18, padding: 20, backgroundColor: C.navy, flexDirection: "row", gap: 14, alignItems: "center" }, auditTitle: { color: C.white, fontSize: 17, fontWeight: "800" }, auditCopy: { color: "#C2C8D8", fontSize: 12, lineHeight: 18 },
  gates: { flexDirection: "row", gap: 12, marginBottom: 18 }, gate: { flex: 1, minWidth: 180 }, gateActive: { borderTopWidth: 4, borderTopColor: C.coral }, gateNumber: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.navy, alignItems: "center", justifyContent: "center", marginBottom: 14 }, onboardGrid: { flexDirection: "row", gap: 16, alignItems: "flex-start" }, comparison: { flexDirection: "row", backgroundColor: C.pale, padding: 14, justifyContent: "space-around", marginBottom: 14 }, onboardMap: { width: 330 }, mappingRow: { minHeight: 54, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, runbook: { width: 280, padding: 22, backgroundColor: C.navy, borderRadius: 5 }, runbookTitle: { color: C.white, fontSize: 20, lineHeight: 25, fontWeight: "800", marginVertical: 10 }, runbookItem: { color: "#D8DCE7", fontSize: 12, marginVertical: 5 },
  liveFlag: { marginTop: 26, padding: 12, borderWidth: 1, borderColor: "#3D7A61", backgroundColor: "#183E36", borderRadius: 4 }, liveFlagTitle: { color: "#A7E4C3", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 }, liveFlagText: { color: C.white, fontSize: 11, marginTop: 4 }, liveIdentity: { marginTop: "auto", paddingTop: 14, borderTopWidth: 1, borderTopColor: "#394160", flexDirection: "row", alignItems: "center", gap: 10 }, liveTenant: { color: "#8F98B2", fontSize: 9, marginTop: 3 },
  statePage: { flex: 1, backgroundColor: C.paper, alignItems: "center", justifyContent: "center", padding: 24, gap: 14 }, stateMark: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line },
  liveSearch: { width: "100%", minHeight: 44, backgroundColor: C.white, borderWidth: 1, borderColor: "#C8C7C1", borderRadius: 4, paddingLeft: 12, flexDirection: "row", alignItems: "center", gap: 8, overflow: "hidden" }, liveSearchInput: { flex: 1, minWidth: 0, height: 42, color: C.ink, fontSize: 14, outlineStyle: "none" } as any, liveSearchGo: { alignSelf: "stretch", minWidth: 44, paddingHorizontal: 14, backgroundColor: C.navy, alignItems: "center", justifyContent: "center" }, inlineError: { color: C.red, fontSize: 11, lineHeight: 16, width: "100%" },
  emptyState: { minHeight: 170, width: "100%", alignItems: "center", justifyContent: "center", gap: 8, padding: 22, borderWidth: 1, borderStyle: "dashed", borderColor: "#B9B8B2", backgroundColor: "#F8F6F1" }, liveEvent: { flexDirection: "row", minHeight: 96, gap: 8 }, offlineBand: { width: "100%", padding: 14, backgroundColor: C.redPale, borderLeftWidth: 4, borderLeftColor: C.red, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  confirmLine: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 12 }, formInput: { minHeight: 44, borderWidth: 1, borderColor: C.line, borderRadius: 4, paddingHorizontal: 12, color: C.ink, fontSize: 13, backgroundColor: C.white, outlineStyle: "none" } as any, liveField: { width: "100%", marginBottom: 14 }, jsonPanel: { marginTop: 14, padding: 14, backgroundColor: C.navy, borderRadius: 4 }, code: { color: "#DCE3F4", fontSize: 11, lineHeight: 17, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }, liveAuditRow: { minHeight: 64, padding: 14, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12 },
  lifecycleLoader: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }, lifecycleLoading: { minHeight: 120, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  referenceBanner: { padding: 14, marginBottom: 12, backgroundColor: C.amberPale, borderWidth: 1, borderColor: "#F1D49B", borderRadius: 5, flexDirection: "row", alignItems: "center", gap: 11 },
  authorityBand: { padding: 13, marginBottom: 18, backgroundColor: C.pale, borderRadius: 5, flexDirection: "row", alignItems: "center", gap: 10 },
  lifecycleMetrics: { marginBottom: 18 }, metricCellNarrow: { minWidth: "50%", borderBottomWidth: 1, borderBottomColor: "#3B4260" },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: C.pale, flexDirection: "row", overflow: "hidden", marginTop: 4 }, progressDone: { backgroundColor: C.green }, progressFlight: { backgroundColor: "#E3A33B" }, progressException: { backgroundColor: C.red },
  progressLegend: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4, marginTop: 8, marginBottom: 12 },
  planRules: { gap: 6, padding: 12, backgroundColor: "#FFFDFC", borderWidth: 1, borderColor: C.line, borderRadius: 4, marginBottom: 6 }, planRule: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  stepList: { borderTopWidth: 1, borderTopColor: C.line, marginTop: 10 },
  stepRow: { flexDirection: "row", gap: 14, paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  stepRowNext: { backgroundColor: "#F5F8FF", borderLeftWidth: 3, borderLeftColor: C.blueInk },
  stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: C.navy }, stepNumberText: { color: C.white, fontSize: 12, fontWeight: "800" },
  stepHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  stepEvidence: { color: C.muted, fontSize: 12, lineHeight: 17 }, familyLine: { color: C.ink, fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  provLine: { color: C.muted, fontSize: 11, lineHeight: 16 }, stepButton: { alignSelf: "flex-start", marginTop: 6 },
  confirmBox: { width: "100%", marginTop: 8, padding: 12, backgroundColor: C.amberPale, borderWidth: 1, borderColor: "#F1D49B", borderRadius: 4 },
  actorLegend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6, marginBottom: 12 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 6 }, legendDot: { width: 9, height: 9, borderRadius: 5 },
  lifecycleTimeline: { borderTopWidth: 1, borderTopColor: C.line },
  timelineDate: { color: C.navy, fontSize: 11, fontWeight: "800", letterSpacing: .6, paddingTop: 14, paddingBottom: 4, textTransform: "uppercase" },
  lifecycleEvent: { minHeight: 64, flexDirection: "row", alignItems: "stretch", gap: 10, paddingVertical: 10, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: C.line, borderLeftWidth: 3, borderLeftColor: "transparent" },
  lifecycleEventActive: { backgroundColor: "#FFF8F6", borderLeftColor: C.coral },
  lifecycleRail: { width: 18, alignItems: "center" }, lifecycleDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.navy, marginTop: 4, zIndex: 2 },
  eventTime: { width: 44, color: C.muted, fontSize: 12, fontWeight: "700", paddingTop: 1 }, eventHeadline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, eventTitle: { color: C.navy, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  mono: { fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "monospace", fontSize: 11 },
  lifecycleSide: { width: 345, gap: 16 }, metaValue: { flexShrink: 1, textAlign: "right", paddingLeft: 12 },
  caregiverCard: { flexDirection: "row", gap: 10, alignItems: "flex-start", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  workItem: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line, gap: 5 },
  provenanceCard: { backgroundColor: C.navy }, inlineProvenance: { padding: 14, marginLeft: 3, backgroundColor: "#FFF8F6", borderBottomWidth: 1, borderBottomColor: C.line },
  provRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 4 }, provValue: { flexShrink: 1, textAlign: "right", color: C.ink },
  provenanceJson: { marginTop: 8, padding: 12, color: "#DDE4F7", backgroundColor: C.navy2, borderRadius: 4, fontSize: 10, lineHeight: 15, fontFamily: Platform.OS === "web" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "monospace" },
  fullWidth: { alignSelf: "stretch" }, compactButton: { minHeight: 40, paddingHorizontal: 10 },
  lcHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 14 }, lcHeaderCompact: { flexDirection: "column", alignItems: "stretch", gap: 6 }, lcHeaderActions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginLeft: -10 },
  syntheticBar: { paddingVertical: 8, paddingHorizontal: 12, marginBottom: 14, backgroundColor: C.amberPale, borderWidth: 1, borderColor: "#F1D49B", borderLeftWidth: 4, borderLeftColor: "#E3A33B", borderRadius: 4 }, syntheticRow: { flexDirection: "row", alignItems: "center", gap: 9 }, syntheticTitle: { flex: 1, color: "#6B3E00", fontSize: 13, lineHeight: 18, fontWeight: "800" },
  disclosure: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, borderRadius: 4, alignSelf: "flex-start" }, disclosureText: { color: C.blueInk, fontSize: 12, fontWeight: "800" },
  lcTabs: { flexDirection: "row", gap: 22, borderBottomWidth: 1, borderBottomColor: C.line, marginBottom: 18 }, lcTabsCompact: { gap: 0, padding: 3, backgroundColor: C.pale, borderRadius: 6, borderBottomWidth: 0, marginBottom: 14 },
  lcTab: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 7, borderBottomWidth: 3, borderBottomColor: "transparent", marginBottom: -1 }, lcTabActive: { borderBottomColor: C.coral }, lcTabCompact: { flex: 1, justifyContent: "center", borderBottomWidth: 0, marginBottom: 0, borderRadius: 4, minHeight: 40 }, lcTabCompactActive: { backgroundColor: C.white, ...shadow },
  lcTabText: { color: C.muted, fontSize: 13, fontWeight: "700" }, lcTabTextActive: { color: C.navy, fontWeight: "800" }, lcTabCount: { color: C.muted, fontSize: 11, fontWeight: "700", backgroundColor: C.pale, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, overflow: "hidden" },
  lcCard: { shadowOpacity: 0, boxShadow: "none", elevation: 0 } as ViewStyle,
  nextCard: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderTopWidth: 4, borderTopColor: C.coral, borderRadius: 5, padding: 20, gap: 10 }, nextTitle: { color: C.navy, fontSize: 24, lineHeight: 30, fontWeight: "800", letterSpacing: -.3 },
  nextFacts: { flexDirection: "row", flexWrap: "wrap", columnGap: 24, rowGap: 10, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }, nextFact: { flexGrow: 1, flexBasis: 150, minWidth: 0 },
  tiles: { flexDirection: "row", gap: 12 }, tile: { flex: 1, minWidth: 0, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 5, padding: 16, gap: 4 }, tileStacked: { flex: 0, flexBasis: "auto" }, tileHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }, tileValue: { color: C.navy, fontSize: 18, lineHeight: 23, fontWeight: "800" }, tileLink: { color: C.blueInk, fontSize: 12, fontWeight: "800", marginTop: 6 },
  stepNumberFuture: { backgroundColor: C.white, borderWidth: 1.5, borderColor: "#B9BCC7" }, stepDetails: { gap: 4, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: C.line, marginVertical: 2 }, stepControls: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginLeft: -6 },
  focusRing: Platform.select({ web: { outlineStyle: "solid", outlineWidth: 2, outlineColor: C.coral, outlineOffset: 2 }, default: {} }) as ViewStyle
});
