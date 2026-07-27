import type { Locale } from "@cfbridge/shared";

export type Messages = {
  common: {
    loading: string;
    retry: string;
    back: string;
    save: string;
    delete: string;
    remove: string;
    create: string;
    cancel: string;
    confirm: string;
    copy: string;
    copied: string;
    dismiss: string;
    name: string;
    done: string;
    todo: string;
    processing: string;
    failedLoad: string;
    failedCreate: string;
    failedUpdate: string;
    failedDelete: string;
    language: string;
    english: string;
    chinese: string;
  };
  app: {
    projects: string;
    logout: string;
    checkingSetup: string;
    setupStatusFailed: string;
  };
  setup: {
    title: string;
    subtitle: string;
    chooseLanguage: string;
    languageHint: string;
    adminPassword: string;
    loginRequired: string;
    loginFailed: string;
    step1Title: string;
    step1Ok: string;
    step1BoundBad: string;
    step1Unbound: string;
    createMetaDb: string;
    needSecrets: string;
    bindHint: string;
    step2Title: string;
    step2Ok: string;
    step2Progress: string;
    pending: string;
    initDb: string;
    upgradeDb: string;
    running: string;
    needStep1: string;
    recheck: string;
    enterConsole: string;
    createdMsg: string;
    createFailed: string;
    applied: string;
    alreadyLatest: string;
    migrateFailed: string;
    pickLanguageFirst: string;
  };
  login: {
    subtitle: string;
    adminPassword: string;
    signIn: string;
    signingIn: string;
    failed: string;
  };
  projects: {
    title: string;
    subtitle: string;
    createTitle: string;
    createCta: string;
    hideCreate: string;
    refOptional: string;
    namePlaceholder: string;
    refPlaceholder: string;
    creating: string;
    allTitle: string;
    empty: string;
    emptyHint: string;
    readonly: string;
    readwrite: string;
  };
  project: {
    notFound: string;
    refBase: string;
    tabOverview: string;
    tabKeys: string;
    tabRedis: string;
    tabD1: string;
    settings: string;
    anonReadonly: string;
    resources: string;
    resourcesEmpty: string;
    colKind: string;
    colName: string;
    colCfId: string;
    kind: string;
    mode: string;
    modeCreate: string;
    modeAttach: string;
    cfId: string;
    createResource: string;
    attachResource: string;
    dangerZone: string;
    dangerZoneHint: string;
    deleteProject: string;
    detachTitle: string;
    detachBody: string;
    deleteProjectTitle: string;
    deleteProjectBody: string;
    alsoDeleteCf: string;
    resourceFailed: string;
    keysNewTitle: string;
    keysNewHint: string;
    keysCreateTitle: string;
    role: string;
    mintKey: string;
    keysTitle: string;
    keysEmpty: string;
    colRole: string;
    colPrefix: string;
    colStatus: string;
    revoked: string;
    active: string;
    revoke: string;
    revokeTitle: string;
    revokeBody: string;
    revokeFailed: string;
    browserKey: string;
    browserKeyHint: string;
    prefix: string;
    list: string;
    listFailed: string;
    getFailed: string;
    putFailed: string;
    keyRequired: string;
    saved: string;
    deleted: string;
    deleteKeyTitle: string;
    deleteKeyBody: string;
    readWrite: string;
    key: string;
    value: string;
    sql: string;
    runQuery: string;
    running: string;
    queryFailed: string;
    result: string;
    zeroRows: string;
    runToSee: string;
  };
};

export type MessagePath = {
  [K in keyof Messages]: `${K & string}.${keyof Messages[K] & string}`;
}[keyof Messages];

export function getMessage(
  messages: Messages,
  path: MessagePath,
  vars?: Record<string, string | number>,
): string {
  const [ns, key] = path.split(".") as [keyof Messages, string];
  const group = messages[ns] as Record<string, string>;
  let text = group[key] ?? path;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export const LOCALE_STORAGE_KEY = "cfbridge_locale";

export function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (v === "en" || v === "zh-CN") return v;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeStoredLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
