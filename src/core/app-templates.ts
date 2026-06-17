import { pascalCase } from 'change-case';

export interface AppTemplateParams {
  appName: string;
  brand: string;
  brandDisplayName: string;
  countryCode: string;
  countryDisplayName: string;
  appType: string;
  splashColor: string;
  themePath: string;
  devBundleId: string;
  prodBundleId: string;
  androidNamespace: string;
  firebaseProjectTest: string;
  firebaseProjectProd: string;
}

function pascal(name: string): string {
  return pascalCase(name);
}

export function pubspecTemplate(params: AppTemplateParams): string {
  return `name: ${params.appName}
description: ${params.brandDisplayName} ${params.countryDisplayName}
publish_to: none

version: 0.0.0+1

environment:
  sdk: ^3.8.1

dependencies:
  app_base:
  core:
  design_system:
  dio: ^5.9.0
  firebase_core: ^4.0.0
  firebase_crashlytics: ^5.0.0
  flutter:
    sdk: flutter
  flutter_bloc: ^9.1.1
  flutter_localizations:
    sdk: flutter
  get_it: ^8.0.3
  go_router: ^16.0.0
  injectable: ^2.5.1
  localization:
  observability:
  shared_preferences: ^2.5.3

dev_dependencies:
  build_runner: ^2.5.4
  flutter_flavorizr: ^2.4.1
  flutter_gen_runner: ^5.11.0
  flutter_native_splash: ^2.4.6
  flutter_test:
    sdk: flutter
  injectable_generator: ^2.8.1
  very_good_analysis: ^9.0.0

flutter:
  uses-material-design: true
  assets:
    - assets/app_icon/logo.png
    - assets/analytics/
    - assets/animations/
  config:
    enable-swift-package-manager: false

flutter_gen:
  output: lib/assets/

flutter_native_splash:
  color: "${params.splashColor}"
  android_12:
    color: "${params.splashColor}"

coverage_threshold: 1
`;
}

export function flavorizrTemplate(params: AppTemplateParams): string {
  return `app:
  android:
    flavorDimensions: "default"

flavors:
  dev:
    app:
      name: "${params.brandDisplayName} ${params.countryDisplayName} [STG]"
    android:
      applicationId: "${params.devBundleId}"
      icon: "assets/app_icon/logo_stg.png"
      customConfig:
        signingConfig: signingConfigs.debug
    ios:
      bundleId: "${params.devBundleId}"
      icon: "assets/app_icon/logo_stg.png"

  prod:
    app:
      name: "${params.brandDisplayName} App"
    android:
      applicationId: "${params.prodBundleId}"
      icon: "assets/app_icon/logo.png"
      customConfig:
        signingConfig: signingConfigs.prod
    ios:
      bundleId: "${params.prodBundleId}"
      icon: "assets/app_icon/logo.png"

instructions:
  [
    "assets:download",
    "assets:extract",
    "android:androidManifest",
    "android:flavorizrGradle",
    "android:buildGradle",
    "android:icons",
    "ios:podfile",
    "ios:xcconfig",
    "ios:buildTargets",
    "ios:schema",
    "ios:plist",
    "ios:icons",
    "google:firebase",
    "assets:clean",
  ]
`;
}

export function versionTemplate(): string {
  return `test:
  version: 0.0.0
  build: 1
prod:
  version: 0.0.0
  build: 1
`;
}

export function makefileTemplate(params: AppTemplateParams): string {
  const apkName = `${params.brandDisplayName}${params.countryDisplayName}.apk`;
  return `.PHONY: generate
generate:
\tdart run build_runner build

.PHONY: generate-watch
generate-watch:
\tdart run build_runner watch

.PHONY: clean-generate
clean-generate:
\tflutter clean && flutter pub get && dart run build_runner build --delete-conflicting-outputs

.PHONY: flavors
flavors:
\tdart run flutter_flavorizr

.PHONY: firebase
firebase:
\t@echo "Detecting Firebase CLI..."
\t@which brew > /dev/null || (echo "Homebrew is not installed." && /bin/bash -c "$$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)")
\t@which firebase > /dev/null || (echo "Firebase CLI is not installed. Installing with 'brew install firebase" && brew install firebase && firebase login)
\t@which flutterfire > /dev/null || (echo "Flutter Fire CLI is not installed. Installing with 'dart pub global activate flutterfire_cli'" && dart pub global activate flutterfire_cli)
\tflutterfire configure --yes --platforms=android,ios --ios-bundle-id=${params.devBundleId} --android-package-name=${params.devBundleId} --project=${params.firebaseProjectTest}

.PHONY: splash
splash:
\tdart run flutter_native_splash:create

.PHONY: ipa
ipa:
\tflutter build ipa --release --dart-define-from-file env/development.env.json --flavor dev --export-options-plist=ExportOptions.plist

.PHONY: apk
apk:
\tflutter build apk --release --flavor dev --dart-define-from-file env/development.env.json
\tcp build/app/outputs/flutter-apk/app-dev-release.apk ~/${apkName}

.PHONY: profile
profile:
\tflutter build ios --profile --flavor dev --dart-define-from-file env/development.env.json

.PHONY: fire-stg
fire-stg:
\tflutterfire configure --yes --project=${params.firebaseProjectTest} --platforms=android,ios --ios-bundle-id=${params.devBundleId} --android-package-name=${params.devBundleId}

.PHONY: fire-prod
fire-prod:
\tflutterfire configure --yes --project=${params.firebaseProjectProd} --platforms=android,ios --ios-bundle-id=${params.prodBundleId} --android-package-name=${params.prodBundleId}
`;
}

export function gitignoreTemplate(): string {
  return `# Miscellaneous
*.class
*.log
*.pyc
*.swp
.DS_Store
.atom/
.build/
.buildlog/
.history
.svn/
.swift/
migrate_working_dir/

# IntelliJ related
*.iml
*.ipr
*.iws
.idea/

# The .vscode folder contains launch configuration and tasks you configure in
# VS Code which you may wish to be included in version control, so this line
# is commented out by default.
#.vscode/

# Flutter/Dart/Pub related
**/doc/api/
**/ios/Flutter/.last_build_id
.dart_tool/
.flutter-plugins
.flutter-plugins-dependencies
.pub-cache/
.pub/
/build/
pubspec.lock

# Symbolication related
app.*.symbols

# Obfuscation related
app.*.map.json

# Android Studio will place build artifacts here
/android/app/debug
/android/app/profile
/android/app/release

# Ignore firebase files
firebase_options.dart
GoogleService-Info.plist
google-services.json

# Ignore Android Studio files
.cxx/
.firebase/
`;
}

export function analysisOptionsTemplate(): string {
  return `include: ../../analysis_options.yaml
`;
}

export function devtoolsOptionsTemplate(): string {
  return `description: This file stores settings for Dart & Flutter DevTools.
documentation: https://docs.flutter.dev/tools/devtools/extensions#configure-extension-enablement-states
extensions:
`;
}

export function envGitignoreTemplate(): string {
  return `*.json
!example.env.json
`;
}

export function exampleEnvJsonTemplate(): string {
  return `{
  "MAPS_PLATFORM_API_KEY": "\${MAPS_PLATFORM_API_KEY}",
  "MAPS_REGION_CODE": "\${MAPS_REGION_CODE}",
  "SEARCH_ADDRESS_PRIMARY_TYPES": "\${SEARCH_ADDRESS_PRIMARY_TYPES}",
  "GOOGLE_MAPS_ANDROID_API_KEY": "\${GOOGLE_MAPS_ANDROID_API_KEY}",
  "GOOGLE_MAPS_IOS_API_KEY": "\${GOOGLE_MAPS_IOS_API_KEY}",
  "BFF_API_KEY": "\${BFF_API_KEY}",
  "BFF_API_URL": "\${BFF_API_URL}",
  "DOCUMENT_TYPES": "\${DOCUMENT_TYPES}",
  "TAB_BAR_ITEMS": "\${TAB_BAR_ITEMS}",
  "SIGN_UP_FORM": "\${SIGN_UP_FORM}",
  "SIGN_UP_FORM_VALIDATION": "\${SIGN_UP_FORM_VALIDATION}",
  "SIGN_IN_FORM_PASSWORD_MIN_LENGTH": "\${SIGN_IN_FORM_PASSWORD_MIN_LENGTH}",
  "PRIME_CONFIG": "\${PRIME_CONFIG}",
  "APP_NAME": "\${APP_NAME}",
  "BRAND_NAME": "\${BRAND_NAME}",
  "PHONE_PREFIXES": "\${PHONE_PREFIXES}",
  "HEADER_ICON_TYPE": "\${HEADER_ICON_TYPE}",
  "ANDROID_STORE_URL": "\${ANDROID_STORE_URL}",
  "IOS_STORE_URL": "\${IOS_STORE_URL}",
  "DOCUMENT_TYPES_CONFIG": "\${DOCUMENT_TYPES_CONFIG}",
  "CHECKOUT_CONFIG": "\${CHECKOUT_CONFIG}",
  "WEB_URL": "\${WEB_URL}",
  "CLARITY_PROJECT_ID": "\${CLARITY_PROJECT_ID}",
  "CMEDIA_CONFIG": "\${CMEDIA_CONFIG}",
  "FACEBOOK_APP_ID": "\${FACEBOOK_APP_ID}",
  "FACEBOOK_CLIENT_TOKEN": "\${FACEBOOK_CLIENT_TOKEN}",
  "NETWORK_INSPECTOR_ENABLED": "\${NETWORK_INSPECTOR_ENABLED}",
  "ENABLED_MEASUREMENT_QUANTITY_SELECTOR": "\${ENABLED_MEASUREMENT_QUANTITY_SELECTOR}",
  "SERVER_FINGERPRINTS": "\${SERVER_FINGERPRINTS}",
  "SSL_PINNING_ENABLED": "\${SSL_PINNING_ENABLED}",
  "ENABLED_FORCE_ADDRESS": "\${ENABLED_FORCE_ADDRESS}",
  "FOOD_CATEGORIES": "\${FOOD_CATEGORIES}",
  "PERSONAL_INFORMATION_FORM": "\${PERSONAL_INFORMATION_FORM}",
  "SHOW_CART_PROMO_SNACKBAR": "\${SHOW_CART_PROMO_SNACKBAR}",
  "HOME_CMS_CONFIG": "\${HOME_CMS_CONFIG}",
  "PLATFORM_REDIRECT_CONFIG": "\${PLATFORM_REDIRECT_CONFIG}",
  "FORCE_UPDATE_ALLOWED_VERSIONS": "\${FORCE_UPDATE_ALLOWED_VERSIONS}",
  "FINANCING_OPTIONS_ACTIVE": "\${FINANCING_OPTIONS_ACTIVE}",
  "INSTALEAP_URL_LIB": "\${INSTALEAP_URL_LIB}",
  "INSTALEAP_TOKEN": "\${INSTALEAP_TOKEN}",
  "IS_INSTALEAP_ENABLED": "\${IS_INSTALEAP_ENABLED}",
  "SHOW_SUBSTITUTION_CRITERION": "\${SHOW_SUBSTITUTION_CRITERION}",
  "ENABLE_COMPATIBILITY_CART": "\${ENABLE_COMPATIBILITY_CART}",
  "SHOW_PDP_SELLER_NAME": "\${SHOW_PDP_SELLER_NAME}",
  "STORYLY_TOKEN": "\${STORYLY_TOKEN}",
  "DEFAULT_SUBSTITUTION_CRITERION": "\${DEFAULT_SUBSTITUTION_CRITERION}",
  "PRODUCT_COUNT_MODE": "\${PRODUCT_COUNT_MODE}",
  "GUEST_USER_EMAIL": "\${GUEST_USER_EMAIL}",
  "GUEST_USER_PASSWORD": "\${GUEST_USER_PASSWORD}",
  "IS_DEVICE_SECURITY_ENABLED": "\${IS_DEVICE_SECURITY_ENABLED}",
  "CORALOGIX_CONFIG": "\${CORALOGIX_CONFIG}",
  "CLARITY_CONFIG": "\${CLARITY_CONFIG}",
  "CONSTRUCTOR_IO_API_KEY": "\${CONSTRUCTOR_IO_API_KEY}",
  "CONSTRUCTOR_IO_BASE_URL": "\${CONSTRUCTOR_IO_BASE_URL}",
  "CMEDIA_ANALYTICS_CONFIG": "\${CMEDIA_ANALYTICS_CONFIG}",
  "RECOVERY_PASSWORD_CONFIG": "\${RECOVERY_PASSWORD_CONFIG}",
  "FORCE_ADDRESS_CONFIG": "\${FORCE_ADDRESS_CONFIG}",
  "CONFIRM_ADDRESS_CONFIG": "\${CONFIRM_ADDRESS_CONFIG}",
  "COMPLETE_ADDRESS_CONFIG": "\${COMPLETE_ADDRESS_CONFIG}",
  "ADD_ADDRESS_CONFIG": "\${ADD_ADDRESS_CONFIG}",
  "ADD_ADDRESS_MANUAL_CONFIG": "\${ADD_ADDRESS_MANUAL_CONFIG}",
  "CONFIRM_ADDRESS_MANUAL_CONFIG": "\${CONFIRM_ADDRESS_MANUAL_CONFIG}",
  "PRODUCT_CARD_REVAMP_CONFIG": "\${PRODUCT_CARD_REVAMP_CONFIG}",
  "ADDRESS_FORMAT_CONFIG": "\${ADDRESS_FORMAT_CONFIG}",
  "USE_GET_ALL_STORES": "\${USE_GET_ALL_STORES}",
  "USE_ADDRESS_SHORT_NAME_STATE": "\${USE_ADDRESS_SHORT_NAME_STATE}",
  "PRICE_FORMATTER_CONFIG": "\${PRICE_FORMATTER_CONFIG}",
  "USE_ADDRESS_MODAL_FIRST_TIME_ADD_TO_CART": "\${USE_ADDRESS_MODAL_FIRST_TIME_ADD_TO_CART}",
  "ACCOUNT_PRIME_ICON_CONFIG": "\${ACCOUNT_PRIME_ICON_CONFIG}",
  "FETCH_NOTIFICATION_ON_HOME": "\${FETCH_NOTIFICATION_ON_HOME}",
  "USE_DELIVERY_EXPRESS": "\${USE_DELIVERY_EXPRESS}",
  "CASHBACK_CONFIG": "\${CASHBACK_CONFIG}"
}
`;
}

export function mainDartTemplate(params: AppTemplateParams): string {
  return `import 'package:${params.appName}/bootstrap.dart';

void main() => bootstrap();
`;
}

export function bootstrapTemplate(params: AppTemplateParams): string {
  return `import 'dart:async';

import 'package:app_base/app/app_builder.dart';
import 'package:app_base/app_base.dart';
import 'package:${params.appName}/dependencies/dependencies.dart';
import 'package:${params.appName}/firebase_options.dart';
import 'package:core/core.dart';
import 'package:design_system/design_system.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:localization/bloc/app_localization_bloc.dart';
import 'package:observability/observability.dart';

Future<void> bootstrap() async {
  await runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();

      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );

      await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(true);

      GoogleFonts.config.allowRuntimeFetching = false;

      await SystemChrome.setPreferredOrientations([
        DeviceOrientation.portraitUp,
      ]);

      FlutterError.onError = (details) {
        WlCrashlyticsManager.reportError(
          details,
          details.stack,
          source: ErrorSource.flutter,
        );
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        WlCrashlyticsManager.reportError(
          error,
          stack,
          source: ErrorSource.platform,
        );
        return true;
      };

      try {
        await setupDependencies();

        PaintingBinding.instance.imageCache.maximumSizeBytes = 300 << 20;

        final deviceSecurityService = getIt<DeviceSecurityService>();
        final isDeviceCompromised = await deviceSecurityService
            .isDeviceCompromised();

        runApp(
          AppBuilder(
            appConfig: getIt<AppConfig>(),
            themeBloc: getIt<AppThemeBloc>(),
            observability: getIt<Observability>(),
            isDeviceCompromised: isDeviceCompromised,
            app: App(
              customBlocProviders: [
                BlocProvider<AppLocalizationBloc>.value(
                  value: getIt<AppLocalizationBloc>(),
                ),
                BlocProvider<AppThemeBloc>.value(value: getIt<AppThemeBloc>()),
              ],
            ),
          ),
        );
      }
      on Exception catch (e, stack) {
        await WlCrashlyticsManager.reportError(
          e,
          stack,
          source: ErrorSource.bootstrap,
        );

        runApp(const AppError());
      }
    },
    (error, stackTrace) {
      WlCrashlyticsManager.reportError(
        error,
        stackTrace,
        source: ErrorSource.zonedGuard,
      );
    },
  );
}
`;
}

export function appBarrelTemplate(params: AppTemplateParams): string {
  return `export 'dependencies/dependencies.dart';
`;
}

export function firebaseOptionsTemplate(): string {
  return `// File generated by FlutterFire CLI.
// ignore_for_file: type=lint
import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'DefaultFirebaseOptions have not been configured for web - '
        'you can reconfigure this by running the FlutterFire CLI again.',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for Android - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for iOS - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.macOS:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for macos - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.windows:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for windows - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      case TargetPlatform.linux:
        throw UnsupportedError(
          'DefaultFirebaseOptions have not been configured for linux - '
          'you can reconfigure this by running the FlutterFire CLI again.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions are not supported for this platform.',
        );
    }
  }
}
`;
}

export function dependenciesTemplate(params: AppTemplateParams): string {
  return `import 'dart:async';

import 'package:app_base/app_base.dart';
import 'package:core/analytics/analytics.dart';
import 'package:get_it/get_it.dart';
import 'package:injectable/injectable.dart';

// ignore: always_use_package_imports
import 'dependencies.config.dart';

final GetIt getIt = GetIt.instance;

@InjectableInit(preferRelativeImports: true)
FutureOr<GetIt> setupDependencies() async {
  await setupBaseDependencies();

  await getIt.init();

  await getIt.isReady<BaseEventEmitter<SearchEvent>>();

  return getIt;
}
`;
}

export function preloadModuleTemplate(params: AppTemplateParams): string {
  return `import 'dart:ui';

import 'package:design_system/helpers/load_theme.dart';
import 'package:design_system/themes/wl_theme.dart';
import 'package:injectable/injectable.dart';
import 'package:localization/app_localization.dart';

@module
abstract class PreloadModule {
  @preResolve
  @lazySingleton
  Future<WlTheme> initTheme() async {
    final theme = await loadTheme('${params.themePath}');
    return theme;
  }

  @preResolve
  @lazySingleton
  Future<AppLocalizationConfig> initLocalizationConfig() async {
    final currentLocale = PlatformDispatcher.instance.locales.first;
    final exactMatch = getLocaleFromAppType(currentLocale, AppType.${params.appType});
    final appLocale = getAppLocaleFromLocale(exactMatch);
    final translations = await appLocale.build();

    return AppLocalizationConfig(
      appType: AppType.${params.appType},
      translations: translations,
      timezone: AppType.${params.appType}.timezone,
    );
  }
}
`;
}

export function blocsModuleTemplate(): string {
  return `import 'package:injectable/injectable.dart';

@module
abstract class BlocModule {}
`;
}

export function collaborativeRouterTemplate(params: AppTemplateParams): string {
  const appPascal = pascal(params.appName);
  return `import 'package:core/core.dart';
import 'package:go_router/go_router.dart';
import 'package:injectable/injectable.dart';

@LazySingleton(as: CollaborativeRouter)
class ${appPascal}CollaborativeRouter implements CollaborativeRouter {
  @override
  List<RouteBase> get routes => [];
}
`;
}

export function assetsTemplate(params: AppTemplateParams): string {
  return `import 'package:app_base/app_base.dart';
import 'package:${params.appName}/assets/assets.gen.dart';
import 'package:flutter/widgets.dart';
import 'package:injectable/injectable.dart';

@Singleton(as: AppAssets)
class AppAssetsImpl implements AppAssets {
  @override
  String get checkoutAnimationPath => Assets.animations.loadingCko;

  @override
  Widget get logo => Assets.appIcon.logo.image();

  @override
  String get searchAction => Assets.analytics.searchAction;

  @override
  String get splashAnimationPath => Assets.animations.splash;
}
`;
}

export function screenNamesTemplate(): string {
  return `import 'package:core/core.dart';
import 'package:injectable/injectable.dart';

@Singleton(as: ScreenNames)
class ScreenNamesImpl implements ScreenNames {
  @override
  String get home => 'Home';

  @override
  String get account => 'Mi Cuenta';

  @override
  String get cart => 'Mi Carrito';

  @override
  String get search => 'Búsqueda';

  @override
  String get categories => 'Pasillos';

  @override
  String get subCategories => 'Sub pasillos';

  @override
  String get plp => 'Lista de Productos';

  @override
  String get pdp => 'Detalle de Producto';

  @override
  String get pdpImageViewer => 'Visor de Imágenes';

  @override
  String get checkout => 'Finalizar Compra';

  @override
  String get checkoutProfile => 'Finalizar Compra - Perfil';

  @override
  String get checkoutShipping => 'Finalizar Compra - Entrega';

  @override
  String get checkoutPayment => 'Finalizar Compra - Pago';

  @override
  String get checkoutConfirmation => 'Finalizar Compra - Confirmacion';

  @override
  String get checkoutError => 'Finalizar Compra - Error';

  @override
  String get orders => 'Mis compras';

  @override
  String get prime => 'Prime';

  @override
  String get offers => 'Ofertas';

  @override
  String get login => 'Iniciar Sesión';

  @override
  String get signUp => 'Registro';

  @override
  String get recoverPassword => 'Recuperar Contraseña';

  @override
  String get createNewPassword => 'Crear nueva contraseña';

  @override
  String get addAddress => 'Agregar dirección';

  @override
  String get addStore => 'Agregar tienda';

  @override
  String get deliveryMode => 'Modo de entrega';

  @override
  String get myAddress => 'Mis direcciones';

  @override
  String get forceDeliveryAddress => 'Dirección de entrega';

  @override
  String get accountGuest => 'Mi Cuenta (Invitado)';

  @override
  String get personalInformation => 'Información personal';

  @override
  String get termsConditions => 'Términos y condiciones';

  @override
  String get dataAuthorization => 'Autorización de datos';

  @override
  String get appDown => 'App No Disponible';

  @override
  String get appDownRedirect => 'Redirección App';

  @override
  String get forceUpdate => 'Actualización Forzada';

  @override
  String get splash => 'Pantalla de Carga';

  @override
  String get promoBanks => 'Promociones Bancarias';

  @override
  String get pdpPaymentTerms => 'Condiciones y Parcelamiento';

  @override
  String get recipes => 'Recetas';

  @override
  String get benefits => 'Beneficios';

  @override
  String get coupons => 'Cupones';

  @override
  String get contactUs => 'Contáctanos';

  @override
  String get prizes => 'Mis premios';

  @override
  String get notifications => 'Avisos';

  @override
  String get deliveryTypeBottomSheet => 'Tipo de Entrega (modal)';

  @override
  String get changeAddressBottomSheet => 'Cambio de Modo de Entrega (modal)';

  @override
  String get cartCommentBottomSheet => 'Comentario de Carrito (modal)';

  @override
  String get substitutionCriterionBottomSheet =>
      'Criterio de Sustitucion (modal)';

  @override
  String get cartTypeBottomSheet => 'Tipo de Carrito (modal)';

  @override
  String get guestUserBottomSheet => 'Usuario Invitado (modal)';

  @override
  String get offerDetailsBottomSheet => 'Detalle de Oferta (modal)';

  @override
  String get offersFilterBottomSheet => 'Filtros de Ofertas (modal)';

  @override
  String get plpFiltersBottomSheet => 'Filtros PLP (modal)';

  @override
  String get walletBr => 'Mi Billetera';

  @override
  String get cardBenefits => 'Tarjeta de Beneficios';

  @override
  String get pzPago => 'Tarjeta PZ Pago';

  @override
  String get myLists => 'Mis Listas';

  @override
  String get myListDetail => 'Detalle de Lista';
}
`;
}

export function setVersionScriptTemplate(): string {
  return `#!/bin/bash

set -e

ENVIRONMENT=\$1

if [[ -z "\$ENVIRONMENT" ]]; then
  echo "❌ Debes indicar el entorno: test o prod"
  exit 1
fi

if [ ! -f "version.yaml" ]; then
  echo "❌ No se encontró el archivo version.yaml"
  exit 1
fi

VERSION=$(awk "/^\${ENVIRONMENT}:/{flag=1; next} /^[a-zA-Z]/ && flag{flag=0} flag && /version:/{print \\\$2}" version.yaml)
BUILD=$(awk "/^\${ENVIRONMENT}:/{flag=1; next} /^[a-zA-Z]/ && flag{flag=0} flag && /build:/{print \\\$2}" version.yaml)

if [[ -z "\$VERSION" || -z "\$BUILD" ]]; then
  echo "❌ No se pudo obtener versión para entorno \$ENVIRONMENT"
  echo "   Entornos disponibles: test, prod"
  exit 1
fi

echo "✅ Estableciendo versión para \$ENVIRONMENT: \$VERSION+\$BUILD"

sed -i '' -E "s/^version: .*/version: \${VERSION}+\${BUILD}/" pubspec.yaml

echo "📝 Versión actualizada en pubspec.yaml:"
grep '^version:' pubspec.yaml
`;
}

export function fixIosIconsScriptTemplate(): string {
  return `#!/usr/bin/env python3
"""
iOS Icon Transparency Remover
Because Apple decided transparency in app icons is apparently a war crime.
"""

import glob
import os

from PIL import Image


def remove_transparency_from_png(
    input_path, output_path=None, background_color=(255, 255, 255)
):
    if output_path is None:
        output_path = input_path

    try:
        with Image.open(input_path) as img:
            if img.mode in ("RGBA", "LA") or (
                img.mode == "P" and "transparency" in img.info
            ):
                background = Image.new("RGB", img.size, background_color)

                if img.mode != "RGBA":
                    img = img.convert("RGBA")

                background.paste(img, mask=img.split()[-1])

                background.save(output_path, "PNG")
                print(f"✓ Removed transparency from: {os.path.basename(input_path)}")
                return True
            else:
                print(f"⚠ No transparency found in: {os.path.basename(input_path)}")
                return False
    except (OSError, IOError, ValueError) as e:
        print(f"✗ Error processing {os.path.basename(input_path)}: {str(e)}")
        return False


def process_ios_icon_folder(folder_path, background_color=(255, 255, 255)):
    if not os.path.exists(folder_path):
        print(f"✗ Folder not found: {folder_path}")
        return

    png_pattern = os.path.join(folder_path, "*.png")
    png_files = glob.glob(png_pattern)

    if not png_files:
        print(f"✗ No PNG files found in: {folder_path}")
        return

    print(f"Found {len(png_files)} PNG files to process...")
    print(f"Using background color: RGB{background_color}")
    print("-" * 50)

    processed_count = 0
    for png_file in png_files:
        if remove_transparency_from_png(png_file, background_color=background_color):
            processed_count += 1

    print("-" * 50)
    print(f"✓ Processed {processed_count} out of {len(png_files)} files")
    print("Your icons are now iOS-compliant. Apple's design police can stand down.")


if __name__ == "__main__":
    PROD_FOLDER = "ios/Runner/Assets.xcassets/prodAppIcon.appiconset"
    DEV_FOLDER = "ios/Runner/Assets.xcassets/devAppIcon.appiconset"

    bg_color = (255, 255, 255)

    process_ios_icon_folder(PROD_FOLDER, bg_color)
    process_ios_icon_folder(DEV_FOLDER, bg_color)
`;
}

export function androidAppBuildGradleTemplate(params: AppTemplateParams): string {
  return `import java.util.Properties
import java.io.FileInputStream
import java.util.Base64

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
    // END: FlutterFire Configuration
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

val dartDefines = mutableMapOf<String, String>()
if (project.hasProperty("dart-defines")) {
    val dartDefinesProperty = project.property("dart-defines") as String
    dartDefinesProperty
        .split(",")
        .forEach { entry ->
            val pair = String(Base64.getDecoder().decode(entry)).split("=")
            if (pair.size == 2) {
                dartDefines[pair[0]] = pair[1]
            }
        }
}

android {
    namespace = "${params.androidNamespace}"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11

        isCoreLibraryDesugaringEnabled = true
    }

    defaultConfig {
        applicationId = "${params.prodBundleId}"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        resValue("string", "google_maps_api_key", dartDefines["GOOGLE_MAPS_ANDROID_API_KEY"] ?: "")
        resValue("string", "facebook_app_id", dartDefines["FACEBOOK_APP_ID"] ?: "")
        resValue("string", "facebook_client_token", dartDefines["FACEBOOK_CLIENT_TOKEN"] ?: "")
        manifestPlaceholders["auth0Domain"] = "empty"
        manifestPlaceholders["auth0Scheme"] = "empty"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
    signingConfigs {

        create("test") {
            if (System.getenv("CI") != null && System.getenv("CM_KEYSTORE_PATH") != null) {
                storeFile = file(System.getenv("CM_KEYSTORE_PATH")!!)
                storePassword = System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CM_KEY_ALIAS")
                keyPassword = System.getenv("CM_KEY_PASSWORD")
            } else {
                keyAlias = keystoreProperties["keyAliasTest"] as String?
                keyPassword = keystoreProperties["keyPasswordTest"] as String?
                storeFile = keystoreProperties["storeFileTest"]?.let { file(it as String) }
                storePassword = keystoreProperties["storePasswordTest"] as String?
            }
        }

        create("prod") {
            if (System.getenv("CI") != null && System.getenv("CM_KEYSTORE_PATH") != null) {
                storeFile = file(System.getenv("CM_KEYSTORE_PATH")!!)
                storePassword = System.getenv("CM_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CM_KEY_ALIAS")
                keyPassword = System.getenv("CM_KEY_PASSWORD")
            } else {
                keyAlias = keystoreProperties["keyAlias"] as String?
                keyPassword = keystoreProperties["keyPassword"] as String?
                storeFile = keystoreProperties["storeFile"]?.let { file(it as String) }
                storePassword = keystoreProperties["storePassword"] as String?
            }
        }
    }
}

flutter {
    source = "../.."
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_11
    }
}

// ----- BEGIN flavorDimensions (autogenerated by flutter_flavorizr) -----
apply { from("flavorizr.gradle.kts") }
// ----- END flavorDimensions (autogenerated by flutter_flavorizr) -----

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
`;
}

export function androidFlavorizrGradleTemplate(params: AppTemplateParams): string {
  return `import com.android.build.gradle.AppExtension

val android = project.extensions.getByType(AppExtension::class.java)

android.apply {
    flavorDimensions("default")

    productFlavors {
        create("dev") {
            dimension = "default"
            applicationId = "${params.devBundleId}"
            signingConfig = signingConfigs.getByName("test")
            resValue(type = "string", name = "app_name", value = "${params.brandDisplayName} ${params.countryDisplayName} [STG]")
        }
        create("prod") {
            dimension = "default"
            applicationId = "${params.prodBundleId}"
            signingConfig = signingConfigs.getByName("prod")
            resValue(type = "string", name = "app_name", value = "${params.brandDisplayName} App")
        }
    }
}
`;
}

export function androidSettingsGradleTemplate(): string {
  return `pluginManagement {
    val flutterSdkPath = run {
        val properties = java.util.Properties()
        file("local.properties").inputStream().use { properties.load(it) }
        val flutterSdkPath = properties.getProperty("flutter.sdk")
        require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
        flutterSdkPath
    }

    includeBuild("\$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "8.9.1" apply false
    // START: FlutterFire Configuration
    id("com.google.gms.google-services") version("4.3.15") apply false
    id("com.google.firebase.crashlytics") version("2.8.1") apply false
    // END: FlutterFire Configuration
    id("org.jetbrains.kotlin.android") version "2.3.21" apply false
}

include(":app")
`;
}

export function androidBuildGradleTemplate(): string {
  return `allprojects {
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://jitpack.io") }
    }
}

val newBuildDir: Directory = rootProject.layout.buildDirectory.dir("../../build").get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
`;
}

export function androidGradlePropertiesTemplate(): string {
  return `org.gradle.jvmargs=-Xmx8G -XX:MaxMetaspaceSize=4G -XX:ReservedCodeCacheSize=512m -XX:+HeapDumpOnOutOfMemoryError
android.useAndroidX=true
android.enableJetifier=true
`;
}

export function mainActivityTemplate(params: AppTemplateParams): string {
  const pkgPath = params.androidNamespace.split('.').join('/');
  return `package ${params.androidNamespace}

import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity()
`;
}

export function searchActionJsonTemplate(): string {
  return JSON.stringify({
    action: "search",
    label: "search_action",
    category: "engagement",
  }, null, 2);
}

export function prismaThemeJsonPath(): string {
  return 'prisma.json';
}

export function themeJsonTemplate(brand: string, countryCode: string): string {
  return JSON.stringify({
    Colors: {
      Light: {
        Text: {
          Primary: {
            "primary-default": "#000000",
            "primary-alternative": "#333333",
            "primary-subtle": "#f5f5f5"
          },
          Secondary: {
            "secondary-default": "#014451",
            "secondary-alternative": "#0694a2",
            "secondary-subtle": "#edfafa"
          },
          Tertiary: {
            "tertiary-default": "#D61F69",
            "tertiary-alternative": "#E74694",
            "tertiary-subtle": "#FDF2F8"
          },
          Neutrals: {
            "neutral-display": "#181b20",
            "neutral-headline": "#181b20",
            "neutral-title": "#181b20",
            "neutral-body": "#313640",
            "neutral-link": "#313640",
            "neutral-label": "#616c7f",
            "neutral-strike": "#616c7f",
            "neutral-caption": "#97a0b0",
            "neutral-disabled": "#97a0b0",
            "neutral-subtle": "#f6f7f8"
          },
          Warning: { "warning-default": "#8e4b10" },
          Info: { "info-default": "#1a56db" },
          Success: { "success-default": "#2f540b" },
          Error: { "error-default": "#c81e1e" },
          Basics: { White: "#ffffff", Black: "#0b0c0e" }
        },
        Background: {
          primary: {
            "bg-primary-surface": "#f5f5f5",
            "bg-primary-default": "#1a1a1a",
            "bg-primary-pressed": "#000000"
          },
          secondary: {
            "bg-secondary-surface": "#edfafa",
            "bg-secondary-default": "#047481",
            "bg-secondary-pressed": "#036672"
          },
          tertiary: {
            "bg-tertiary-surface": "#FDF2F8",
            "bg-tertiary-default": "#D61F69",
            "bg-tertiary-pressed": "#BF125D"
          },
          neutrals: {
            "bg-neutral-surface": "#f6f7f8",
            "bg-neutral-disabled": "#eff1f4",
            "bg-neutral-active": "#ebecf0",
            "bg-neutral-default": "#616c7f",
            "bg-neutral-skeleton": "#ebecf0",
            "bg-neutral-feedback": "#313640"
          },
          error: {
            "bg-error-surface": "#fdf2f2",
            "bg-error-default": "#e02424",
            "bg-error-pressed": "#c81e1e"
          },
          warning: {
            "bg-warning-surface": "#fdfdea",
            "bg-warning-default": "#9f580a"
          },
          info: {
            "bg-info-surface": "#ebf5ff",
            "bg-info-default": "#1c64f2"
          },
          success: {
            "bg-success-surface": "#eef6e7",
            "bg-success-default": "#38640c"
          },
          basics: { "bg-basics-white": "#ffffff" },
          product: { "bg-product": "#ffffff" },
          splash: { "bg-splash": "#000000" }
        },
        icons: {
          "icon-primary-default": "#1a1a1a",
          "icon-primary-subtle": "#f5f5f5",
          "icon-secondary-default": "#047481",
          "icon-secondary-subtle": "#edfafa",
          "icon-tertiary-default": "#047481",
          "icon-tertiary-subtle": "#edfafa",
          "icon-neutral-default": "#313640",
          "icon-neutral-disabled": "#97a0b0",
          "icon-neutral-alternative": "#97a0b0",
          "icon-neutral-subtle": "#f6f7f8",
          "icon-error-default": "#e02424",
          "icon-warning-default": "#9f580a",
          "icon-info-default": "#1c64f2",
          "icon-success-default": "#38640c",
          "icon-like-default": "#D61F69"
        },
        Border: {
          "border-primary-default": "#000000",
          "border-primary-focus": "#333333",
          "border-primary-alternative": "#e0e0e0",
          "border-secondary-default": "#014451",
          "border-secondary-focus": "#0694a2",
          "border-secondary-alternative": "#d5f5f6",
          "border-tertiary-default": "#047481",
          "border-tertiary-focus": "#036672",
          "border-tertiary-alternative": "#d5f5f6",
          "border-neutral-disabled": "#d7dae0",
          "border-neutral-focus": "#616c7f",
          "border-neutral-default": "#d7dae0",
          "border-error-default": "#f05252",
          "border-warning-default": "#fce96a",
          "border-info-default": "#3f83f8",
          "border-success-default": "#48840e",
          "border-basics-white": "#ffffff"
        },
        Gradient: {
          Primary: {
            "primary-gradient-low": "#E0E0E0",
            "primary-gradient-medium": "#666666",
            "primary-gradient-high": "#000000"
          },
          Secondary: {
            "secondary-gradient-low": "#D5F5F6",
            "secondary-gradient-medium": "#0694A2",
            "secondary-gradient-high": "#014451"
          },
          Tertiary: {
            "tertiary-gradient-low": "#FCE8F3",
            "tertiary-gradient-medium": "#E74694",
            "tertiary-gradient-high": "#99154B"
          },
          Neutrals: {
            "neutrals-gradient-low": "#EFF1F4",
            "neutrals-gradient-medium": "#7C879B",
            "neutrals-gradient-high": "#313640"
          }
        },
        Tags: {
          Solid: { "tag-bg-default": "#FA3FCA" },
          Subtle: { "tag-bg-subtle": "#FEF0F9" },
          Blackfriday: { "tag-bg-cross": "#0B0C0E" }
        }
      },
      Dark: {
        Text: {
          Primary: {
            "primary-default": "#e0e0e0",
            "primary-alternative": "#cccccc",
            "primary-subtle": "#28142b"
          },
          Secondary: {
            "secondary-default": "#80e2ee",
            "secondary-alternative": "#5ddbe7",
            "secondary-subtle": "#133232"
          },
          Tertiary: {
            "tertiary-default": "#da4a88",
            "tertiary-alternative": "#b02a6b",
            "tertiary-subtle": "#320d21"
          },
          Neutrals: {
            "neutral-display": "#caced5",
            "neutral-headline": "#caced5",
            "neutral-title": "#caced5",
            "neutral-body": "#b1b6c0",
            "neutral-link": "#b1b6c0",
            "neutral-label": "#99a0ac",
            "neutral-strike": "#99a0ac",
            "neutral-caption": "#808998",
            "neutral-disabled": "#808998",
            "neutral-subtle": "#1d2023"
          },
          Warning: { "warning-default": "#dfa36e" },
          Info: { "info-default": "#235dd0" },
          Success: { "success-default": "#b9e58d" },
          Error: { "error-default": "#cf4444" },
          Basics: { White: "#1a1a1a", Black: "#d8dadf" }
        },
        Background: {
          primary: {
            "bg-primary-surface": "#133232",
            "bg-primary-default": "#e0e0e0",
            "bg-primary-pressed": "#cccccc"
          },
          secondary: {
            "bg-secondary-surface": "#164446",
            "bg-secondary-default": "#75dfeb",
            "bg-secondary-pressed": "#5ddbe7"
          },
          tertiary: {
            "bg-tertiary-surface": "#3a0e26",
            "bg-tertiary-default": "#da4a88",
            "bg-tertiary-pressed": "#b02a6b"
          },
          neutrals: {
            "bg-neutral-surface": "#1d2023",
            "bg-neutral-disabled": "#1d2023",
            "bg-neutral-active": "#23252C",
            "bg-neutral-default": "#58606d",
            "bg-neutral-skeleton": "#23252c",
            "bg-neutral-feedback": "#b1b6c0"
          },
          error: {
            "bg-error-surface": "#320d0d",
            "bg-error-default": "#c93232",
            "bg-error-pressed": "#cf4444"
          },
          warning: {
            "bg-warning-surface": "#3a3a0c",
            "bg-warning-default": "#dfa36e"
          },
          info: {
            "bg-info-surface": "#07223c",
            "bg-info-default": "#235dd0"
          },
          success: {
            "bg-success-surface": "#263519",
            "bg-success-default": "#b9e58d"
          },
          basics: { "bg-basics-white": "#1a1a1a" },
          product: { "bg-product": "#ffffff" },
          splash: { "bg-splash": "#000000" }
        },
        icons: {
          "icon-primary-default": "#e0e0e0",
          "icon-primary-subtle": "#28142b",
          "icon-secondary-default": "#5ddbe7",
          "icon-secondary-subtle": "#133232",
          "icon-tertiary-default": "#da4a88",
          "icon-tertiary-subtle": "#320d21",
          "icon-neutral-default": "#b1b6c0",
          "icon-neutral-disabled": "#808998",
          "icon-neutral-alternative": "#808998",
          "icon-neutral-subtle": "#1d2023",
          "icon-error-default": "#c93232",
          "icon-warning-default": "#e4a560",
          "icon-info-default": "#235dd0",
          "icon-success-default": "#b9e58d",
          "icon-like-default": "#D61F69"
        },
        Border: {
          "border-primary-default": "#e0e0e0",
          "border-primary-focus": "#cccccc",
          "border-primary-alternative": "#666666",
          "border-secondary-default": "#75dfeb",
          "border-secondary-focus": "#5ddbe7",
          "border-secondary-alternative": "#164446",
          "border-tertiary-default": "#da4a88",
          "border-tertiary-focus": "#b02a6b",
          "border-tertiary-alternative": "#3a0e26",
          "border-neutral-disabled": "#30343B",
          "border-neutral-focus": "#99a0ac",
          "border-neutral-default": "#30343B",
          "border-error-default": "#c93232",
          "border-warning-default": "#dfa36e",
          "border-info-default": "#235dd0",
          "border-success-default": "#b9e58d",
          "border-basics-white": "#1a1a1a"
        },
        Gradient: {
          Primary: {
            "primary-gradient-low": "#4D2754",
            "primary-gradient-medium": "#666666",
            "primary-gradient-high": "#e0e0e0"
          },
          Secondary: {
            "secondary-gradient-low": "#164446",
            "secondary-gradient-medium": "#5DDBE7",
            "secondary-gradient-high": "#97E3F2"
          },
          Tertiary: {
            "tertiary-gradient-low": "#3A0E26",
            "tertiary-gradient-medium": "#B02A6B",
            "tertiary-gradient-high": "#DA6695"
          },
          Neutrals: {
            "neutrals-gradient-low": "#23252C",
            "neutrals-gradient-medium": "#697283",
            "neutrals-gradient-high": "#B1B6C0"
          }
        },
        Tags: {
          Solid: { "tag-bg-default": "#B8198F" },
          Subtle: { "tag-bg-subtle": "#360A26" },
          Blackfriday: { "tag-bg-cross": "#D8DADF" }
        }
      }
    },
    spacing: {
      "spacing-none": 0, "spacing-xs": 2, "spacing-s": 4, "spacing-m": 6,
      "spacing-l": 8, "spacing-xl": 12, "spacing-2xl": 16, "spacing-3xl": 20,
      "spacing-4xl": 24, "spacing-5xl": 32, "spacing-6xl": 40, "spacing-7xl": 48,
      "spacing-8xl": 56, "spacing-9xl": 64
    },
    Typography: {
      fontFamily: "PlusJakartaSans",
      styles: {}
    },
    "border-radius": {
      "radius-none": "0px", "radius-xs": "2px", "radius-s": "4px", "radius-m": "8px",
      "radius-l": "12px", "radius-xl": "16px", "radius-2xl": "20px", "radius-3xl": "24px",
      "border-full": "9999px"
    },
    stroke: { "stroke-1": "1px solid", "stroke-2": "2px solid", "stroke-3": "3px solid" },
    "stroke-dash": { "stroke-dash-1": "1px dashed", "stroke-dash-2": "2px dashed", "stroke-dash-3": "3px dashed" },
    elevation: {
      elevation_1: { offset: [0, 3], blurRadius: 6, spreadRadius: 0, colorRef: "overlay-dark-1", opacity: "10%" },
      elevation_2: { offset: [0, 4], blurRadius: 8, spreadRadius: -1, colorRef: "overlay-dark-2", opacity: "20%" },
      elevation_3: { offset: [0, 6], blurRadius: 12, spreadRadius: -2, colorRef: "overlay-dark-2", opacity: "20%" }
    },
    overlays: {
      Light: {
        dark: {
          "overlay-dark-1": "#3136401A", "overlay-dark-2": "#31364033", "overlay-dark-3": "#3136404D",
          "overlay-dark-4": "#31364066", "overlay-dark-5": "#31364080"
        },
        light: {
          "overlay-light-1": "#FFFFFF1A", "overlay-light-2": "#FFFFFF33", "overlay-light-3": "#FFFFFF4D",
          "overlay-light-4": "#FFFFFF66", "overlay-light-5": "#FFFFFF80"
        }
      },
      Dark: {
        dark: {
          "overlay-dark-1": "#3136401A", "overlay-dark-2": "#31364033", "overlay-dark-3": "#3136404D",
          "overlay-dark-4": "#31364066", "overlay-dark-5": "#31364080"
        },
        light: {
          "overlay-light-1": "#FFFFFF1A", "overlay-light-2": "#FFFFFF33", "overlay-light-3": "#FFFFFF4D",
          "overlay-light-4": "#FFFFFF66", "overlay-light-5": "#FFFFFF80"
        }
      }
    },
    Assets: {
      AppLogo: `assets/images/app_logos/${brand}-${countryCode}.svg`
    }
  }, null, 2);
}

export function runnerEntitlementsTemplate(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
</dict>
</plist>
`;
}

export function addressRouterTemplate(params: AppTemplateParams): string {
  return `import 'package:address/address.dart';
import 'package:${params.appName}/dependencies/dependencies.dart';
import 'package:categories/categories.dart';
import 'package:core/core.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:home/home.dart';
import 'package:injectable/injectable.dart';
import 'package:plp/plp.dart';

@Singleton(as: AddressRouter)
class AddressRouterImpl implements AddressRouter {
  AddressRouterImpl(this._screenNames);

  final ScreenNames _screenNames;

  @override
  String get deliveryModePageFullPath => DeliveryModePage.fullPath;

  @override
  String get addAddressFullPath => AddAddressPage.fullPath;

  @override
  GoRoute get addAddressPage => AddAddressPage(
    openHomePage: HomePage.openWithCallback,
    bloc: (_) => getIt(),
    confirmAddressBloc: (_) => getIt(),
    completeAddressBloc: (_) => getIt(),
    name: _screenNames.addAddress,
    platformRedirectConfig: getIt(),
    openPlpPage: PlpPage.open,
    openCategoryPage: CategoriesPage.open,
    openAddAddressManualPage: openAddAddressManualPage,
    subRoutes: [
      ?addAddressManualPage,
    ],
  );

  @override
  String get addStoreFullPath => AddStorePage.fullPath;

  @override
  GoRoute get addStorePage => AddStorePage(
    openHomePage: HomePage.open,
    name: _screenNames.addStore,
    bloc: (_) => getIt(),
  );

  @override
  GoRoute get deliveryModePage => DeliveryModePage(
    openHomePage: HomePage.openWithCallback,
    name: _screenNames.deliveryMode,
    platformRedirectConfig: getIt(),
    openCategoryPage: CategoriesPage.open,
    deliveryTypeBottomSheetRouteName: _screenNames.deliveryTypeBottomSheet,
  );

  @override
  String get forceDeliveryAddressFullPath => '/force-delivery-address';

  @override
  GoRoute get forceDeliveryAddressPage => DeliveryModePage(
    openHomePage: HomePage.openWithCallback,
    path: forceDeliveryAddressFullPath,
    name: _screenNames.forceDeliveryAddress,
    platformRedirectConfig: getIt(),
    openCategoryPage: CategoriesPage.open,
    deliveryTypeBottomSheetRouteName: _screenNames.deliveryTypeBottomSheet,
  );

  @override
  GoRoute get myAddressPage => MyAddressPage(
    name: _screenNames.myAddress,
  );

  @override
  String get myAddressFullPath => MyAddressPage.fullPath;

  @override
  OnOpenDeliveryModePage get openDeliveryModePage => DeliveryModePage.open;

  @override
  void Function(BuildContext) get openMyAddressPage => MyAddressPage.open;

  @override
  void Function(BuildContext, {bool? isFromForceAddress})
  get openAddAddressPage => AddAddressPage.open;

  @override
  void Function(BuildContext) get openAddStorePage => AddStorePage.open;

  @override
  String? get favoriteStoreSelectionFullPath => null;

  @override
  GoRoute? get favoriteStoreSelectionPage => null;

  @override
  OnOpenFavoriteStoreSelectionPage? get openFavoriteStoreSelectionPage => null;

  @override
  OnPushFavoriteStoreSelectionPage? get pushFavoriteStoreSelectionPage => null;

  @override
  String? get validateZipCodeFullPath => null;

  @override
  GoRoute? get validateZipCodePage => null;

  @override
  OnOpenValidateZipCodePage? get openValidateZipCodePage => null;

  @override
  String? get addAddressManualFullPath => AddAddressManualPage.fullPath;

  @override
  GoRoute? get addAddressManualPage => AddAddressManualPage(
    bloc: (_) => getIt(),
    confirmAddressManualBloc: (_) => getIt(),
    openHomePage: HomePage.openWithCallback,
    openPlpPage: PlpPage.open,
    openCategoryPage: CategoriesPage.open,
    platformRedirectConfig: getIt(),
  );

  @override
  OnOpenAddAddressManualPage? get openAddAddressManualPage =>
      AddAddressManualPage.open;
}
`;
}

export function countryModuleTemplate(): string {
  return `import 'package:core/core.dart';
import 'package:dio/dio.dart';
import 'package:injectable/injectable.dart';

@module
abstract class CountryModule {
  @lazySingleton
  GetCountryStates getCountryStates(CountryRepository repository) =>
      GetCountryStates(repository: repository);

  @lazySingleton
  GetCountryCities getCountryCities(CountryRepository repository) =>
      GetCountryCities(repository: repository);

  @lazySingleton
  GetCountryLocalitiesByStateId getLocalitiesByStateId(
    CountryRepository repository,
  ) => GetCountryLocalitiesByStateId(repository: repository);

  @lazySingleton
  GetCountryLocalitiesByCityId getLocalitiesByCityId(
    CountryRepository repository,
  ) => GetCountryLocalitiesByCityId(repository: repository);

  @lazySingleton
  CountryRepository countryRepository(CountryRestDataSource dataSource) =>
      CountryRepositoryData(dataSource: dataSource);

  @lazySingleton
  CountryRestDataSource countryRestDataSource(BffCountryApi api) =>
      CountryRestDataSource(api: api);

  @lazySingleton
  BffCountryApi bffCountryApi(Dio dio, AppConfig config, AppEnvironment env) {
    // For local development
    // final baseUrl = env.bffApiUrl;
    final baseUrl = config.bffApiUrl ?? env.bffApiUrl;

    return BffCountryApi(dio, baseUrl: baseUrl);
  }
}
`;
}

export function storeModuleTemplate(): string {
  return `import 'package:core/core.dart';
import 'package:injectable/injectable.dart';

@module
abstract class StoreModule {
  @lazySingleton
  GetStoreStates getStoreStates(
    StoreBranchRepository repository,
  ) => GetStoreStates(repository);

  @lazySingleton
  GetStoreBranches getStoreBranches(
    StoreBranchRepository repository,
  ) => GetStoreBranches(repository);

  @lazySingleton
  StoreBranchRepository storeBranchRepository(
    CountryRestDataSource dataSource,
  ) => StoreBranchRepositoryData(dataSource: dataSource);
}
`;
}

export function checkoutModuleTemplate(params: AppTemplateParams): string {
  return `import 'package:app_base/app_base.dart';
import 'package:checkout/checkout.dart';
import 'package:${params.appName}/${params.appName}.dart';
import 'package:core/core.dart';
import 'package:injectable/injectable.dart';

@module
abstract class CheckoutModule {
  @singleton
  CheckoutPage checkoutPage(ScreenNames screenNames) => CheckoutPage(
    name: screenNames.checkout,
    checkoutBloc: (context) => getIt(),
    view: CheckoutViewAr(
      animationPath: getIt<AppAssets>().checkoutAnimationPath,
      screenNames: screenNames,
    ),
  );
}
`;
}

export function primeModuleTemplate(params: AppTemplateParams): string {
  return `import 'package:${params.appName}/dependencies/dependencies.dart';
import 'package:core/core.dart';
import 'package:injectable/injectable.dart';
import 'package:pdp/pdp.dart';
import 'package:plp/plp.dart';
import 'package:prime/prime.dart';

@module
abstract class PrimeModule {
  @singleton
  PrimePage primePage(ScreenNames screenNames) => PrimeCmsPage(
    name: screenNames.prime,
    cmsViewBloc: (context) => getIt(),
    featuredProductBloc: (context) => getIt(),
    primeBloc: (context) => getIt(),
    personalizedProductBloc: (context) => getIt(),
    openPlpPage: PlpPage.open,
    openPdpPage: PdpPage.open,
  );
}
`;
}

export function sessionRouterImplTemplate(params: AppTemplateParams): string {
  return `import 'package:app_base/app_base.dart';
import 'package:${params.appName}/${params.appName}.dart';
import 'package:core/core.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:injectable/injectable.dart';
import 'package:login/login.dart';
import 'package:recover_password/recover_password.dart';
import 'package:sign_up/sign_up.dart';

@Singleton(as: SessionRouter)
class SessionRouterImpl implements SessionRouter {
  SessionRouterImpl(this._screenNames);

  final ScreenNames _screenNames;

  @override
  String get loginFullPath => LoginPage.fullPath;
  @override
  String get signUpFullPath => SignUpPage.fullPath;
  @override
  String get recoverPasswordFullPath => RecoverPasswordPage.fullPath;

  @override
  GoRoute get loginPage => LoginPage(
    name: _screenNames.login,
    logo: getIt<AppAssets>().logo,
    loginBloc: (context) => getIt(),
    openSignUpPage: openSignUpPage,
    openRecoverPasswordPage: openRecoverPasswordPage,
    openCreatePasswordPage: CreateNewPasswordPage.open,
    enableNetworkInspector: enableNetworkInspector,
  );

  @override
  GoRoute get signUpPage => SignUpPage(
    name: _screenNames.signUp,
    signUpBloc: (context) => getIt(),
    signUpClickEventEmitter: getIt(),
    phonePrefixes: getItBase<AppEnvironment>().phonePrefixes,
    validation: getItBase<AppEnvironment>().signUpFormValidation,
    documentTypes: getItBase<AppEnvironment>().documentTypes,
    openCreatePasswordPage: CreateNewPasswordPage.open,
    openLoginPage: openLoginPage,
  );

  @override
  GoRoute get recoverPasswordPage => RecoverPasswordPage(
    recoverPasswordBloc: (_) => getIt(),
    openCreatePasswordPage: CreateNewPasswordPage.open,
    openSignUpPage: (context, {String? email}) =>
        openSignUpPage(context, id: email),
    name: _screenNames.recoverPassword,
  );

  @override
  void Function(
    BuildContext, {
    bool? resetTemplateState,
    bool? showSuspendedAccountAlert,
  })
  get openLoginPage =>
      (context, {resetTemplateState, showSuspendedAccountAlert}) =>
          LoginPage.open(context);

  @override
  void Function(BuildContext, {String? id}) get openSignUpPage =>
      SignUpPage.open;

  @override
  void Function(BuildContext, {String? email}) get openRecoverPasswordPage =>
      RecoverPasswordPage.open;
}
`;
}
