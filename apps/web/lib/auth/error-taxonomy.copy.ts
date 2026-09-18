import { AUTH_ERROR_KINDS, type AuthErrorKind } from './error-taxonomy';

export const AUTH_COPY_NAMESPACE = 'auth';

export type AuthErrorCopyPart = 'title' | 'message' | 'action';

export interface AuthErrorCopy {
  title: string;
  message: string;
  action: string;
}

export function authErrorCopyKey(kind: AuthErrorKind, part: AuthErrorCopyPart): string {
  return `errorTaxonomy.${kind}.${part}`;
}

export const AUTH_ERROR_SOURCE_COPY: Readonly<Record<AuthErrorKind, AuthErrorCopy>> = {
  rate_limited: {
    title: 'Too many attempts',
    message: 'For your safety we paused sign-in on this device for a moment.',
    action: 'Try again',
  },
  code_expired: {
    title: 'That code expired',
    message: 'Codes last a few minutes. Send a fresh one and enter it straight away.',
    action: 'Send a new code',
  },
  code_incorrect: {
    title: 'That code is not right',
    message: 'Check the last code we emailed you and enter its six digits again.',
    action: 'Try again',
  },
  link_expired: {
    title: 'This link expired',
    message: 'Sign-in links are single use and short lived. Start again to get a new one.',
    action: 'Start again',
  },
  link_already_used: {
    title: 'This link was already used',
    message: 'That sign-in link has been spent. Start again to get a new one.',
    action: 'Start again',
  },
  account_suspended: {
    title: 'This account is suspended',
    message: 'Sign-in is blocked while the account is suspended. Support can tell you why.',
    action: 'Contact support',
  },
  account_locked: {
    title: 'This account is locked',
    message: 'Too many failed attempts locked the account. It unlocks on its own shortly.',
    action: 'Try again later',
  },
  credentials_invalid: {
    title: 'That did not match',
    message: 'The email and password do not match an account.',
    action: 'Try again',
  },
  identifier_not_found: {
    title: 'No account uses this email',
    message: 'No account uses this email.',
    action: 'Create an account',
  },
  identifier_exists: {
    title: 'This email already has an account',
    message: 'This email already has an account.',
    action: 'Log in instead',
  },
  provider_cancelled: {
    title: 'Sign-in was cancelled',
    message: 'You closed the provider window before it finished. Nothing was changed.',
    action: 'Try again',
  },
  provider_outage: {
    title: 'That provider is not responding',
    message: 'We could not reach the provider. Your account is fine, the provider is not.',
    action: 'Try another way',
  },
  passkey_dismissed: {
    title: 'Passkey prompt closed',
    message: 'The passkey prompt closed before it finished.',
    action: 'Try again',
  },
  passkey_unrecognized: {
    title: 'That passkey is not registered',
    message: 'This device has no passkey for an account here. Use your email instead.',
    action: 'Use email instead',
  },
  network_unreachable: {
    title: 'You look offline',
    message: 'We could not reach the server. Check your connection and try again.',
    action: 'Try again',
  },
  unexpected: {
    title: 'Something went wrong',
    message: 'Something went wrong. Try again.',
    action: 'Try again',
  },
};

export type AuthCopyLocale = 'en' | 'es';

export const AUTH_ERROR_LOCALIZED_COPY: Readonly<
  Record<AuthCopyLocale, Readonly<Record<AuthErrorKind, AuthErrorCopy>>>
> = {
  en: AUTH_ERROR_SOURCE_COPY,
  es: {
    rate_limited: {
      title: 'Demasiados intentos',
      message: 'Por seguridad pausamos el inicio de sesión en este dispositivo un momento.',
      action: 'Inténtalo de nuevo',
    },
    code_expired: {
      title: 'Ese código caducó',
      message: 'Los códigos duran unos minutos. Pide uno nuevo e introdúcelo enseguida.',
      action: 'Enviar un código nuevo',
    },
    code_incorrect: {
      title: 'Ese código no es correcto',
      message: 'Revisa el último código que te enviamos e introduce sus seis dígitos otra vez.',
      action: 'Inténtalo de nuevo',
    },
    link_expired: {
      title: 'Este enlace caducó',
      message: 'Los enlaces son de un solo uso y duran poco. Empieza de nuevo para recibir otro.',
      action: 'Empezar de nuevo',
    },
    link_already_used: {
      title: 'Este enlace ya se usó',
      message: 'Ese enlace de acceso ya se gastó. Empieza de nuevo para recibir otro.',
      action: 'Empezar de nuevo',
    },
    account_suspended: {
      title: 'Esta cuenta está suspendida',
      message:
        'El acceso está bloqueado mientras la cuenta esté suspendida. Soporte puede explicarte por qué.',
      action: 'Contactar con soporte',
    },
    account_locked: {
      title: 'Esta cuenta está bloqueada',
      message: 'Demasiados intentos fallidos bloquearon la cuenta. Se desbloquea sola en breve.',
      action: 'Inténtalo más tarde',
    },
    credentials_invalid: {
      title: 'No coincide',
      message: 'El correo y la contraseña no coinciden con ninguna cuenta.',
      action: 'Inténtalo de nuevo',
    },
    identifier_not_found: {
      title: 'Ninguna cuenta usa este correo',
      message: 'Ninguna cuenta usa este correo.',
      action: 'Crear una cuenta',
    },
    identifier_exists: {
      title: 'Este correo ya tiene una cuenta',
      message: 'Este correo ya tiene una cuenta.',
      action: 'Iniciar sesión',
    },
    provider_cancelled: {
      title: 'Se canceló el inicio de sesión',
      message: 'Cerraste la ventana del proveedor antes de terminar. No se cambió nada.',
      action: 'Inténtalo de nuevo',
    },
    provider_outage: {
      title: 'Ese proveedor no responde',
      message: 'No pudimos contactar con el proveedor. Tu cuenta está bien, el proveedor no.',
      action: 'Probar otra forma',
    },
    passkey_dismissed: {
      title: 'Se cerró la solicitud de clave de acceso',
      message: 'La solicitud de clave de acceso se cerró antes de terminar.',
      action: 'Inténtalo de nuevo',
    },
    passkey_unrecognized: {
      title: 'Esa clave de acceso no está registrada',
      message:
        'Este dispositivo no tiene una clave de acceso para ninguna cuenta aquí. Usa tu correo.',
      action: 'Usar el correo',
    },
    network_unreachable: {
      title: 'Parece que estás sin conexión',
      message: 'No pudimos contactar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
      action: 'Inténtalo de nuevo',
    },
    unexpected: {
      title: 'Algo salió mal',
      message: 'Algo salió mal. Inténtalo de nuevo.',
      action: 'Inténtalo de nuevo',
    },
  },
};

export function authErrorResourceBundle(
  locale: AuthCopyLocale,
): Record<string, Record<AuthErrorCopyPart, string>> {
  const copy = AUTH_ERROR_LOCALIZED_COPY[locale];
  return Object.fromEntries(AUTH_ERROR_KINDS.map((kind) => [kind, copy[kind]]));
}
