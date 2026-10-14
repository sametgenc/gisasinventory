# Yerel doğrulama

Güncelleme: 15 Ekim 2026. Kullanıcı testi için [izole demo ortamı](TEST_ORTAMI.md); adım adım iş akışları için [kullanım rehberi](KULLANIM_REHBERI.md).

## Çözüm önerileri ve geliştirme talepleri

- Mevcut geri bildirim kayıtları korunarak özel talep ekranı eklendi. İhtiyaç, isteğe bağlı çözüm/fayda, dosyalar, yanıtlar ve değerlendirme geçmişi aynı kayıtta tutulur. Kullanıcı yalnız kendi mevcut tersane kapsamındaki taleplerini görür; aynı tersane yöneticisi dahil başka kişiler okuyamaz. Aktif, tersanesiz gerçek platform yöneticisi durum, öncelik ve sorumlu yönetir. Eski kapsamı bilinmeyen kayıtlar global yöneticide kalır; geçmiş üyelik tahmin edilmez.
- Yeni talep, yanıt ve değerlendirme mevcut bildirim/e-posta kuyruğunu kullanır. Bildirim gövdesi özel açıklama, çözüm, fayda veya ek adlarını taşımaz. Rolü kaldırılan platform yöneticisinin eski yönetici bildirimleri görünmez ve gönderilmez. Dosyalar yalnız yetkili indirme adresinden, attachment/no-store/nosniff ile sunulur. Bozuk Office arşivi, geçersiz kimlik, aşırı uzun filtre ve dosya sınırları için regresyon vardır.
- Atomik ortak cache sayaçları kullanıcıda 6/dakika + 30/saat, global yöneticide 60/dakika + 300/saat yazma bütçesi uygular. Oluşturma, yanıt ve değerlendirme aynı hesap bütçesini paylaşır; okuma sınırlandırılmaz. Sabit zaman pencerelerinin sınırında en fazla iki kat kısa süreli gönderim mümkündür; saatlik bütçe toplamı sınırlar. Cache kesintisi yazmadan önce 503, sınır aşımı 429/Retry-After verir. Bağımsız güvenlik denemesinde 12 yüklemenin 6'sı kabul, 6'sı reddedildi; yalnız 6 dosya/kayıt/olay/bildirim oluştu. Arayüz Türkçe/İngilizce açıklama verir ve taslağı korur.
- Yalnız bu değişikliklerle hazırlanan izole adayda tam backend **473 test** geçti: SQLite'ta 3 PostgreSQL'e özel, PostgreSQL'de 15 SQLite demo hazırlamasına özel atlama. Yeni throttle için 7 gerçek API testi ve bağımsız güvenlik kontrolü geçti. Eski ortak kullanım gizlilik testindeki rastgele katalog kodu/“50” çakışması, kesin kamuya açık alan kontrolüyle giderildi; PostgreSQL'de son test ayrıca geçti. Django sistem ve migration tutarlılığı temiz.
- Tam normal Chromium paketi **182/182** geçti. Son yerelleştirilmiş 429 mesajı değişikliğinden sonra yeni ekranın **15/15** hedefli testi ayrıca geçti. Son TypeScript, üretim derlemesi ve değişen frontend dosyalarının hedefli ESLint kontrolü başarılı. Tüm depodaki önceden mevcut **48 lint hatası/3 uyarı** sürer; TypeScript reviewer'ın genel lint kapısı bu nedenle resmi tam lint onayı vermez. Bağımsız kapsam incelemesi tamamlandı; ana JavaScript paketi yaklaşık **1.106 kB**, mevcut boyut uyarısı sürer.
- Gerçek demo yolculuğu personelin çözüm önerisi/dosya oluşturmasını, aynı/başka tersane hesabının erişememesini, platform değerlendirmesini, yanıtları ve bildirim bağlantısını doğruladı. Senaryo yalnız kendi kurmaca talebini temizler; önceki kayıtları korur. Ayrı iki kurmaca kullanıcı denemesi mevcut yerel demoda bırakıldı. SQLite yedeği alınıp yalnız `platform_feedback.0002` uygulandı; kaynak envanter, demo DB ve yeni ekran görüntüleri Git kapsamına alınmadı.
- Genel kod, Python ve güvenlik incelemelerindeki bulgular giderildi. Canlı dağıtım ve gerçek SMTP teslimi yapılmadı. Canlıda tek migration süreci ve mevcut yedekleme akışı kullanılır: [CANLI_GUNCELLEME.md](CANLI_GUNCELLEME.md).

## Dinamik envanter ve bedelsiz ortak kullanım

- Ortak ekipman türü/katalog kodu, sahibi tersane ve yerel envanter kodu ayrıldı. Yeni alanlar ve stok önerileri isteğe bağlıdır; kod, görünen ad ve adet görevleri açıkça seçilir. Etiket değişimi mevcut anahtarı ve eski değerleri korur. Yeni zorunlu alanda etki sayıları, eksik kayıt filtresi ve aktif tersane yöneticisine revizyon başına toplu bildirim vardır.
- Üç sayfalı Excel türleri, dinamik alanları ve seçilen tersanenin envanterini birlikte aktarır. Önizleme dosya/tercih/kullanıcı/tersane ve ilgili kayıt revizyonuna bağlıdır; yazım kilit altında tekrar doğrulanır ve bütün dosya tek işlemde uygulanır. Toplam ve tekrar başlıklar gerekçeleriyle ayrılır; belirsiz B/C kararı manuel tamamlanır. Formül, mükerrer kimlik veya yetkisiz sahiplikte veri yazılmaz. Sayısal kimlikler ondalık hassasiyetini korur; kod-only manuel kayıtlar indeksli sorguyla kontrol edilir, toplu aktarım tek tür için kimlikleri bir kez okur.
- Kullanım bedelsizdir; aktif sahibi tersane yöneticisi onay/red, teslim ve iade verir. Platform hesabı tersane adına onay veremez. Onaylanan ve teslim edilen adetler ayrılır; gecikmiş iade miktarı serbest bırakmaz. Kapasite azalması, açık talepte sahip/tür değişimi ve silme korunur. İlgisiz tersane özel envanteri veya kullanım ayrıntısını okuyamaz. Özel kullanım amacı e-postaya konmaz; mevcut güvenli bildirim kuyruğu kullanılır.
- Tam backend paketi **SQLite: 440 test, 3 PostgreSQL'e özel atlama**; **PostgreSQL: 440 test, 15 SQLite demo hazırlamasına özel atlama** ile geçti. Gerçek PostgreSQL'deki üç yarış testi eşzamanlı onayların 200/409 ayrımını, durum/bildirim geri almasını ve aktör/bildirim kilit uyumunu doğrular. Django sistem kontrolü ve migration tutarlılığı temizdir; eski migration'lar değiştirilmedi.
- Tam normal Chromium paketi **168/168 geçti**. Dinamik form/önizleme/320px aktarım, kod-only envanter araması ve oturum iptalinde sabit giriş yönlendirmesi için regresyon vardır. Son TypeScript, üretim derlemesi ve değişen ürün/test dosyalarının hedefli ESLint kontrolü geçti. Genel depodaki **48 lint hatası/3 uyarı** ayrı borçtur; ana JavaScript paketi yaklaşık **1.082 kB**, boyut uyarısı sürer.
- Tam gerçek yerel demo paketi **14/14 geçti**, atlanan veya kararsız test yoktur. Yeni akış beş tekrarda ayrıca geçti: üç sayfalı dosya, isteğe bağlı alanlar, toplam satırı atlama, sahibi yayınlama, diğer tersane talebi, sahip onayı/teslim/iade ve karşı tersane geçmişi. Deneme kaydı yalnız kurmaca fixture'larla oluşturuldu; mevcut envanter/tür kimlikleri ve güncelleme tarihleri korunur. Son küçük eşleştirme açıklaması değişikliği ayrıca normal Excel senaryolarıyla doğrulandı. Yerel test çıktıları, demo SQLite ve kaynak belgeler Git kapsamına alınmaz.
- İki güncel üretim imajı yerelde derlendi; backend sistem kontrolü, Nginx yapılandırması ve yedi uygulama adresinin yönlendirmesiz 200/no-store davranışı geçti. JavaScript önbelleği ve eksik dosya 404 kontrolü korundu. GitHub Verify'a izole PostgreSQL 16 işi eklendi; uzaktaki sonucu yerel testlerden ayrı değerlendirin. Geçici yerel PostgreSQL ve HTTP test konteynerleri kapatıldı; demo çalışır kalır.
- Uygulama içi TR/EN, Markdown ve çevrimdışı HTML rehberleri aynı akışı anlatır. HTML 320/390/1440px, arama/sıfırlama, tema, bağlantılar ve yazdırmada geçti. Bağımsız genel, Python/TypeScript ve güvenlik incelemelerinde yeni açık bulgu kalmadı. Canlı dağıtım, gerçek SMTP ve gerçek Turnstile/SIEM teslimi yapılmadı; kurulum gereksinimleri [CANLI_GUNCELLEME.md](CANLI_GUNCELLEME.md) içindedir.

<a id="guvenlik-captcha-ve-siem"></a>
## Güvenlik, CAPTCHA ve SIEM

14 Ekim 2026 güvenlik çalışması, dışa açık girişleri ve tersane sınırlarını kapsar. Kontroller kurmaca verilerle, izole SQLite/PostgreSQL ve taklit edilen tarayıcı/sağlayıcı yanıtlarıyla çalıştırılır. Canlı sunucuya dağıtım, gerçek CAPTCHA doğrulaması ve gerçek SIEM teslimi bu çalışmanın sonucu sayılmaz.

### Erişim sınırları ve giderilen bulgular

- `CROSS_TENANT_SHARING_ENABLED=false` varsayılandır. Eski yayımlanmış ekipmanlar ve mevcut kullanım talepleri de diğer tersanelere kapalıdır. Ortak ekipman tanımları merkezi katalogdur; özel envanter ve tersane kullanıcıları kendi tersanesinde kalır. Paylaşımı açmak bu güvenlik politikasını değiştirir.
- Global yetki yalnız aktif, `is_superuser=True`, `tenant_id=None` hesaplara verilir. Tersaneye bağlı staff/superuser veya yalnız `platform_admin` rolü başka tersaneye geçemez. Kullanıcı tercihi gereği MFA bütün hesaplarda isteğe bağlıdır; `ADMIN_REQUIRE_MFA=false` varsayılandır. Canlıda açıkça `true` seçilirse global yönetici API'leri ve Django admin, son 5 dakikada doğrulanmış gerçek TOTP/WebAuthn faktörü ister. MFA kurulumu/doğrulaması ve hesabın güvenlik durumunu okuma erişilebilir kalır.
- Parola ile HTTP Basic Auth kaldırıldı; yalnız oturum tabanlı API erişimi kullanılır. CSRF kontrolü olmayan Allauth app istemcisi kapatıldı; frontend browser istemcisini kullanır. Django admin parolayla ayrı giriş yapamaz; uygulama girişine yönlendirir.
- DRF HTML formları yabancı tersane/kullanıcı seçeneklerini gösterebiliyordu. API yalnız JSON döndürür; ilişki alanlarının seçenekleri ayrıca tersaneye sınırlandırılır.
- Tersane/rol/staff/superuser değişimi eski oturumları iptal eder. Oturum hash'i kullanıcı satırı kilitlendikten sonra tekrar denetlenir; doğrulama ile taşıma arasındaki yarış kapatılır. Ekipman ataması kayıt öncesi güncel kullanıcıyla doğrulanır; eski tersane atamaları temizlenir, yabancı atama kimliği çıktıda gizlenir.
- Envanter detay/liste/düzenleme/silme/Excel aktarımı ve tersane-kullanıcı işlemleri sahte kimliklerle sınanır. Pasif üyelikler reddedilir. Hatalı UUID filtresi 500 yerine 400 döndürür.
- Bildirimler oluşturulduğu tersaneyi kaydeder. `notifications.0005` geçmişi silmez; tarihsel tersanesi bilinmeyen eski iş bildirimlerini görünümden/teslimden çıkarır. Hesap güvenliği bildirimleri korunur. SSE ve e-posta, güncel üyeliği `User → Tenant → Notification` kilitleri altında tekrar doğrular.

### CAPTCHA ve dışa açık giriş

Üretim için `.envs/.env.local` içinde `TURNSTILE_ENABLED=true`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES` gereklidir. Cloudflare widget'ının alan adı uygulamayla eşleşmelidir. Anahtar eksikliği veya üretimde CAPTCHA'yı kapatma başlangıcı engeller. Yerel demo/testte dış sağlayıcı kullanılmaz.

Giriş, kayıt, parola sıfırlama, giriş kodu, e-posta doğrulama, MFA ve sağlayıcı giriş/bağlama işlemleri sunucuda Siteverify ile denetlenir. Başarılı yanıt, beklenen action ve izinli hostname birlikte gerekir. Hatalı, tüketilmiş, süresi dolmuş token veya sağlayıcı kesintisi erişimi açmaz. Widget her denemeden sonra sıfırlanır; frontend yapılandırma/script yükleme hatasında gönderimi durdurur.

Sağlayıcıya gitmeden önce paylaşılan Redis sayacı IP başına 60 saniyede 60 deneme sınırı uygular; Redis kesintisi doğrulamayı kapatır. Allauth kendi hesap/kod limitlerini ayrıca uygular. Üretimde sadece Traefik portları yayımlanmalıdır; `X-Real-IP` yalnız bu proxy tarafından belirlenir. İstemcinin gönderdiği `X-Forwarded-For` güvenilir sayılmaz. Ek proxy/CDN eklendiğinde güvenilir IP zinciri ayrıca ayarlanmalıdır.

Frontend CSP, Turnstile script/frame alanını ve Google form yönlendirmesini açıkça izinli tutar; diğer form hedeflerini engeller. Kimlik URL'leri loglara girmesin diye proxy logları alan listesiyle daraltılır, ham Gunicorn/Nginx erişim logları kapatılır. API yanıtları `private, no-store` kullanır. Üretim Docker loglarında boyut/dosya sayısı sınırlıdır; kullanılmayan Docker soketi proxy'den çıkarılmıştır.

### Denetim kayıtları ve SIEM teslim sözleşmesi

`audit.0001`–`audit.0003` migration'ları uygulanmalıdır. `AuditEvent` değişmez kanıttır; `SiemDelivery` ayrı teslim durumudur. İstek okuma/yazma/reddetme/hata, giriş/çıkış/başarısız giriş, kullanıcı/rol/izin değişimleri, model ve admin işlemleri kaydedilir. Toplu işlemler HTTP işlem kaydıyla kapsanır; normal model kayıt/silmelerinde nesne kimlikleri ve değişen alan adları da bulunur.

Kayıt alanları: UTC zaman, olay/istek UUID'si, aktör kimliği/rolü/tersanesi, hedef tersane/nesne kimliği, HTTP metodu, sunucunun rota şablonu, durum/sonuç, IP ve izinli CAPTCHA reddetme nedeni. Parola, token, OTP, SMTP/SIEM anahtarı, ham URL/sorgu, istek gövdesi veya envanter içeriği kaydedilmez. Kullanıcı silinse de aktör kimliği kanıtta kalır.

Denetim kaydı kalıcılaştırılamıyorsa ilgili HTTP işlemi geri alınır ve 503 döner. PostgreSQL trigger'ları UPDATE, DELETE ve TRUNCATE işlemlerini reddeder; uygulama/admin ayrıca salt okunurdur. Canlı uygulamanın DB rolü tablo sahibi/superuser olmamalı ve DDL/trigger değiştirme yetkisi almamalıdır. Migration için ayrı sahip hesabı kullanılmalıdır; sahibi olan DBA bu korumayı değiştirebilir. Merkezi SIEM erişimi ve saklama politikası ayrıca yönetilmelidir.

SIEM hazır olana kadar `AUDIT_SIEM_ENABLED=false` kalabilir; kanıt ve outbox yine oluşturulur. Teslim için `AUDIT_SIEM_ENABLED=true`, `AUDIT_SIEM_URL=https://...`, `AUDIT_SIEM_TOKEN=...` tanımlanır. Bu bir genel HTTPS JSON kolektör sözleşmesidir; Splunk HEC, Sentinel, QRadar veya syslog biçimine özgü adaptör henüz canlıda doğrulanmış değildir.

Her POST tek olay JSON'u, `Authorization: Bearer ...` ve olay UUID'sini içeren `Idempotency-Key` gönderir. TLS doğrulanır; HTTP, yönlendirme, URL içinde kimlik bilgisi ve ortam proxy/netrc kullanımı reddedilir. Yanıt gövdesi loglanmaz. Başarılı 2xx teslim kabulüdür; kolektör yalnız kalıcı kabulden sonra 2xx dönmelidir. Ağ hatası/reddetme durumunda olay silinmez; gecikmeli yeniden deneme ve takılı iş kurtarması vardır. En az bir kez teslim nedeniyle kolektör `event_id` ile tekrarları ayıklamalıdır.

Celery worker ve tek beat süreci çalışmalıdır; `apps.audit.tasks.deliver_pending_audit_events` her 30 saniyede çalışır. İzleme/manuel gönderme:

```bash
docker compose -f docker-compose.prod.yml exec web python manage.py audit_siem_status
docker compose -f docker-compose.prod.yml exec web python manage.py deliver_audit_events --limit 100
```

Bekleyen kayıt sayısı, en eski olay zamanı ve başarısız teslimler SIEM/operasyon izlemesine alınmalıdır. Outbox ve kanıt otomatik silinmez; disk kapasitesi, dış arşiv ve saklama süresi üretim için ayrıca belirlenmelidir. Canlı güncelleme ve anahtar koruma adımları: [CANLI_GUNCELLEME.md](CANLI_GUNCELLEME.md).

Resmî teknik kaynaklar: [Turnstile sunucu doğrulaması](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Django güvenlik yamaları](https://www.djangoproject.com/weblog/2026/oct/06/security-releases/), [Allauth güvenlik düzeltmeleri](https://docs.allauth.org/en/latest/release-notes/recent.html).

### Son doğrulama ve kalan kurulum

- Yamalı bağımlılıklarla 197 odaklı backend testi, 35 CAPTCHA/giriş/MFA/sağlayıcı tarayıcı testi ve 49 PostgreSQL yetki/izolasyon testi geçti. Ek kullanım talebi/workbook/izolasyon paketi 60 testte geçti. Üretim derlemesi, TypeScript, Django production güvenlik kontrolü, migration tutarlılığı ve Compose yapılandırması geçti.
- Geçici PostgreSQL'de gerçek SQL UPDATE/DELETE/TRUNCATE denemeleri trigger tarafından engellendi. İki bağlantıyla kullanıcı taşımasının istek kilidini beklediği, eski atamanın temizlendiği ve çakışan atama kilidinin sağlıklı veritabanı bağlantısıyla reddedildiği ayrıca doğrulandı. Geçici sunucu kapatıldı.
- Son `pip-audit`: kurulu 53 paket ve kilitli 54 genel paket için 0 bilinen açık, 0 atlanan paket. Son tam `npm audit`: üretim ve derleme araçları dahil 0 bilinen açık; pnpm kilidindeki her paket/sürüm de taranan npm grafiğinde mevcut. Django 5.2.18, Allauth 65.19.7 ve diğer etkilenen paketler güncellendi. npm/pnpm kilitleri eşlendi. Login/e-posta kodu 6 rakam, parola sıfırlama kodu 8 tire içermeyen karakter olarak korundu.
- Genel ve Python güvenlik incelemelerindeki bulgular giderildi. Formal TypeScript incelemesi, depodaki mevcut 48 ESLint hatası/3 uyarı nedeniyle tam lint kapısını geçmedi; yeni CAPTCHA/CSP testleri hedefli lint ve tip kontrolünden geçti.
- Eşzamanlı envanter geliştirmesiyle görülen eski stok/kimlik/tür değişimi hataları giderildi. Son bütünleşik backend paketi SQLite'ta **440 test, 3 PostgreSQL'e özel atlama**; gerçek geçici PostgreSQL'de **440 test, 15 SQLite demo hazırlamasına özel atlama** ile geçti. PostgreSQL'deki üç yarış testi gerçek kilit, geri alma ve çakışan onay davranışını ayrıca doğrular; atlanan demo testlerinde üretim veri koruması kaldırılmadı.
- Gerçek Turnstile widget anahtarları/alan adı, SIEM ürününe uygun kolektör/adaptör, gizli aktarım anahtarı, yetkileri ayrılmış PostgreSQL runtime/migration rolleri ve kanıt saklama politikası canlı ortamda tamamlanmalıdır. Uygulama dışındaki sunucu/ağ erişimleri veya canlı uçtan uca CAPTCHA/SIEM teslimi bu yerel testlerle doğrulanmış sayılmaz.

Python 3.13+ ve Node 22.12+ kullanın (`.nvmrc`: 22). Python bağımlılıklarının kaynağı `backend/pyproject.toml` + `uv.lock`; Docker frontend kurulumu `pnpm-lock.yaml` kullanır. İki frontend kilidi birlikte güncellenmelidir.

```bash
cd backend
uv sync --locked
uv run python manage.py check --settings=config.test_settings
uv run python manage.py makemigrations --check --dry-run --settings=config.test_settings
uv run python manage.py test --settings=config.test_settings --noinput
```

Test ayarı gerçek `DATABASE_URL` yerine bellekte SQLite kullanır. Gerçek veritabanı, Redis, SMTP veya kullanıcı hesabını değiştirmez.

`config.demo_settings` bundan ayrı, kalıcı `var/demo/demo.sqlite3` kullanır. Demo başlatıcısı yalnız bu veritabanına migration ve kurmaca veri hazırlar. Gerçek oturumla giriş ve dosya aktarımını denemek için:

```bash
bash scripts/start-demo.sh
```

Arayüz `http://127.0.0.1:5190`, arka uç `http://127.0.0.1:8011`. Güncel demo başlangıç verisi: 3 tersane, 4 hesap, 15 tip, 33 ekipman ve 12 bildirim; 3 ekipman açıkça ortak listeye yayımlanmıştır. Yeniden hazırlama mevcut kayıtları silmez veya kullanıcının kaldırdığı yayını geri açmaz; kullanıcı değişikliklerinden sonra sayılar farklı olabilir.

```bash
cd frontend
npm ci
npx playwright install chromium
npm run build
npm test
npm run lint
```

Tarayıcı testleri localhost:5187 üzerinde kendilerine ait Vite sunucusu açar; mevcut 5173 sunucusu kullanılmaz. Tema fixture'ı uygulamanın gerçek ThemeProvider/ThemeToggle bileşenlerini kullanır. API testleri HTTP yanıtlarını taklit ederek gerçek Axios istemcisinin davranışını sınar. Bunlar canlı kimlik doğrulama/SMTP testi değildir.

Global lint mevcut Allauth/form kodundaki teknik borç nedeniyle başarısız olabilir; kurallar kapatılmamıştır. Build TypeScript kontrolünü içerir. Ayrıntılı ürün/teknik GAP'ler `GISBIR_SSRP_GAP_ANALIZI.md` içindedir.

## Dağıtım notları

- Yerel Nginx yapılandırması özel feedback medya yolunu kapatır; yerel stack kullanılıyorsa Nginx yeniden yüklenmelidir.
- Katalog alanları ve bağlı ekipman varken tip silme koruması `assets.0003_assettype_catalog_code_assettype_category_code_and_more` migration'ını gerektirir. Bu migration uygulanmamış ortamda backend yayınlanmadan önce migration çalıştırılmalıdır. Backend, frontend, worker ve beat image'ları birlikte yeniden oluşturulmalıdır.
- Bildirim listesi artık `{count, next, previous, results}` döndürür; frontend ile backend birlikte yayınlanmalıdır. Eski frontend liste biçimini de okuyabiliyor ancak eski tam liste ekranında sayfa seçimi yoktur.
- Excel kullanıcı aktarımında boş parola artık hata verir. Şablonda parola zorunludur; mevcut hesapların parolaları değişmez.
- Eski heartbeat kayıtları silinmedi; normal listeden gizleniyor. Kalıcı Celery Beat heartbeat kaydı mevcutsa görev artık kayıtsız `ping` yayınlar; yönetici bu gereksiz periyodik görevi ayrıca kapatabilir.
- Daha sıkı alan doğrulaması mevcut hatalı varlık verilerini sonraki düzenlemede reddedebilir; mevcut kayıtlar otomatik dönüştürülmez.
- Ekipman şablonu aktarımı benzersiz anahtar bulunan tiplerde aynı tersane + tip + anahtarla mevcut kaydı günceller; `created_count` ve `updated_count` ayrı döner. Anahtarsız tiplerde yeni kayıt oluşturulur. Frontend ile backend birlikte yayınlanmalıdır.
- Demo başlangıç dosyaları, hesapları ve HTTP/DEBUG ayarları üretim ayarı değildir. `config.demo_settings` ve `VITE_DEMO_MODE=true` yalnız yerel demo için kullanılır.
- Canlı sunucuya herhangi bir dağıtım veya veri değişikliği yapılmadı.
- Kontrollü ortak liste için `assets.0004_asset_sharing` migration'ı gerekir. Mevcut ekipmanlar varsayılan özel kalır. Yeni backend ve frontend birlikte yayımlanmalıdır; gerçek üretim ortamında migration bu çalışma sırasında uygulanmadı.

## 21 Eylül 2026 önceki doğrulama kaydı

- Django sistem kontrolü ve migration tutarlılığı: geçti. Katalog değişikliklerinin migration'ı `assets.0003` dosyasındadır; önceki “yeni migration yok” notu düzeltilmiştir.
- Backend: 37 regresyon testi, izole SQLite; katalog önizleme/onay, atomik geri alma, tekrar aktarım, yetki, sınıflandırma ve güvenli tip silme senaryoları dahil.
- Tarayıcı: 9 Playwright testi; gerçek Chromium, masaüstü/mobil tema, klavye/scroll, API hata kontratı, multipart, reddedilen varlık kaydı ve katalog Excel önizleme/onay akışı.
- TypeScript ve production build: geçti; ana JS paket boyutu uyarısı devam ediyor.
- npm audit fix sonrası: 0 açık bildirildi; uyumlu sürümler uygulandı, `--force` kullanılmadı.
- uv ve pnpm kilit tutarlılığı: geçti.
- Global lint temiz değildi; önceki raporlar farklı ara değişikliklerde 78–81 hata bildirdi. Çoğu Allauth tipleri/hook ve form bileşenleri. Bunlar tarihsel sonuçtur; güncel sayı yeni çalıştırmayla ölçülmelidir.
- `.github/workflows/verify.yml` push/PR için backend ve frontend test/build kontrollerini ekler. Workflow burada uzaktan çalıştırılmadı; global lint henüz bu kapıya dahil değildir.

## 14 Ekim 2026 kabul kapsamı

- İzole demo ayarı üretim veritabanı adresini kullanmamalı; başlangıç verisi tekrar hazırlanırken mevcut kullanıcı değişiklikleri korunmalı.
- Gerçek demo hesabıyla giriş, kurum kapsamındaki envanter, rehber ve deneme dosyaları ulaşılabilir olmalı.
- Katalog önizlemesinde önceki/yeni değerler ve boş hücreyle temizlenecek bilgiler görünmeli; “yalnız yeni” modunda atlanan mevcut kayıtlar değişiklik yapılacakmış gibi gösterilmemeli.
- Ekipman şablonu aynı benzersiz anahtarla yeniden aktarılınca yeni kopya oluşturmamalı; mevcut ek alanlar ve oluşturan kullanıcı korunmalı.
- Mobil menü, açık/koyu tema, form hataları ve klavyeyle pencere kullanımı test edilmeli.
- Rehber çevrimdışı açılmalı; mobilde okunmalı, arama/tema/yazdırma çalışmalı. Demo bağlantıları için yerel sunucu gerekir.

Bu kabul listesi test planıdır; tamamlanmış sonuçlarla karıştırılmamalıdır. Güncel test sonuçları aşağıda çalışma sonunda kaydedilir.

### Rehber ve demo modülü için doğrulananlar

- Demo veri/ayar regresyonları: 9 test geçti; ilk veri sayıları 3 tersane, 4 hesap, 15 tip, 30 ekipman, 12 bildirim olarak doğrulandı.
- Çevrimdışı HTML rehber gerçek Chromium'da açıldı: 11 bölüm, dış kaynak/CDN kullanmama, arama ve gezinmeden aramayı temizleme, tema değiştirme ve yazdırma görünümü geçti.
- Rehber 390 px mobil genişlikte yatay sayfa taşması olmadan çalıştı; JavaScript kapalıyken bütün içerik okunabilir kaldı. Masaüstü açık ve mobil koyu görünüm ekran görüntüleri incelendi.
- Kullanım metni ve deneme dosyası akışları gerçek demo veri hazırlama kaynağıyla karşılaştırıldı; Forklift dosyasının uygulama şablonu olarak otomatik tanınması ve tekrar aktarım anahtarı anlatıma yansıtıldı.

Tam backend/tarayıcı paketi ve güncel lint/build sonuçları bu alt kontrollerden ayrı kaydedilmelidir.

### 14 Ekim 2026 güncel kod kontrolleri

- Backend tam regresyon paketi: 55 test geçti.
- Django sistem kontrolü ve `makemigrations --check --dry-run`: geçti; mevcut migration dosyaları model durumu ile tutarlı.
- Yeni/değişen UI dosyaları için hedefli lint: temiz. Genel frontend lint: 76 hata / 5 uyarı; mevcut Allauth ve form/hook teknik borcu devam ediyor. Genel lint başarılı diye raporlanmamalı.
- Kod incelemesinde yüksek/kritik bulgu kalmadı. Rehber yazdırma davranışı ve değiştirilmiş demo parola gösterimi için bulunan orta öncelikli sorunlar düzeltildi.
- Tam normal Playwright paketi: **16 / 16 geçti**. API hata kontratı, tema merkez koordinatları, klavye/scroll, eksik tersane yönlendirmesi, hata/tekrar deneme, filtre sıfırlama, pencere odağı, işlem sırasında kapama ve `0/false`/ondalıklı form değerleri dahil.
- Gerçek demo Chromium paketi: **5 / 5 geçti** (`npm run test:demo`). Gerçek Allauth girişi ve CSRF/session, MIG/MAG şablon indirme, kurum görünürlüğü, hatalı/geçerli katalog önizleme ve onay, ekipman şablonunun iki kez aktarımı, 390 px mobil menü/tema/rehber ve koyu temada yazdırma doğrulandı. Deneme kayıtları yalnız testin oluşturduğu kimliklerle temizlendi; başlangıç verileri korundu.
- TypeScript ve production build geçti. Ana JavaScript paketi yaklaşık 907 kB; boyut uyarısı kalan teknik borçtur.
- Tema regresyon testi gerçek `Element.animate()` efektlerini oluştuğu anda gözlemliyor; yoğun CPU altında efekt bitmeden inceleme yapamama yarışı giderildi. Animasyon veya View Transition davranışı taklit edilmiyor.

Gerçek demo ekran görüntüleri: [ana ekran](images/demo-dashboard.png), [katalog önizlemesi](images/demo-catalog-preview.png), [envanter](images/demo-inventory.png), [uygulama rehberi](images/demo-guide.png), [mobil koyu envanter](images/demo-inventory-mobile-dark.png), [mobil koyu rehber](images/demo-guide-mobile-dark.png). Bunlar canlı üretim görüntüsü değil, kurmaca yerel demo görüntüleridir.

### 14 Ekim 2026 kurumsal görünüm doğrulaması

- Ortak tipografi, çelik mavisi/slate renkler, küçük köşeler, düz yüzeyler ve ölçülü ikonlar; navigasyon, ana ekran, giriş, katalog, envanter, kullanıcı ve tersane yönetimine uygulandı. Ek olarak parola kurtarma, giriş kodu, e-posta hesabı ve bildirim panelindeki dekoratif efektler kaldırıldı.
- Normal Playwright paketi **16 / 16**, gerçek demo paketi **5 / 5** yeniden geçti. Gerçek demo testleri rehberde kullanılan `demo-*.png` görsellerini yeni görünümle yeniledi. Tema düğmesi merkezinden başlayan animasyon, oturum/CSRF, rol kapsamı ve Excel aktarım regresyonları bu kapsamda kaldı.
- `node scripts/capture-interface.mjs`: yerel demo sağlık işareti kontrol edilerek 1440 × 1000 masaüstü ve 390 × 844 mobilde açık/koyu temayla **36 sayfa görünümü** yakalandı. Beklenen rota, yatay sayfa taşması ve koyu temada gerçek hesaplanan klavye odağı kontrol edildi. Envanter ve hesap verileri değiştirilmedi; yalnız demo hesabıyla giriş yapıldı.
- Ana ekran, katalog, giriş, mobil envanter ve koyu hesap ekranı görselleri incelendi. Mobil envanterde ekipman kodu tersane sütunundan önce görünür; tablo sıralaması ve satır işlemleri korunur.
- Çevrimdışı HTML rehber gerçek Chromium'da yeniden kontrol edildi: 390 px okunurluk/taşma, arama, tema, yazdırma ve yerel görseller geçti; dış kaynak isteği veya JavaScript hatası yok. [Güncel rehber görüntüsü](images/offline-guide-corporate.png).
- TypeScript ve production build geçti. Ortak bileşenler ve ana ürün ekranlarındaki hedefli lint temiz. Ek kimlik ekranlarının üçü temiz; giriş kodu ekranında mevcut `catch(any)` hatası ve hook bağımlılık uyarısı sürüyor. Global lint borcu kapatılmış değildir.
- Bağımsız son kod incelemesinde yeni bulgu kalmadı. Koyu temadaki odak kontrastı açık mavi outline ile düzeltildi; form gönderimi, bekleyen kimlik doğrulama akışları, izinler ve klavye davranışı korundu.

Türkçe demo görselleri: [ana ekran](images/corporate-dashboard-desktop-light.png), [koyu ana ekran](images/corporate-dashboard-desktop-dark.png), [katalog](images/corporate-catalog-desktop-light.png), [giriş](images/corporate-login-desktop-light.png), [mobil envanter](images/corporate-inventory-mobile-light.png), [koyu hesap](images/corporate-account-email-desktop-dark.png). Ürün GAP'leri [UI_GAP_ANALIZI.md](UI_GAP_ANALIZI.md) içinde; bu görsel düzenleme rezervasyon veya paylaşım iş akışı eklemez.

### Merkezi envanter ve kontrollü ortak liste — son doğrulama

Kullanıcının ürün amacı, farklı tersane dosyalarını ortak tanımlarla birleştirmek ve yalnız sahibinin yayımladığı ekipmanları ortak listede göstermektir. Bu son dilimin ayrıntılı analizi [ORTAK_ENVANTER_URUN_ANALIZI.md](ORTAK_ENVANTER_URUN_ANALIZI.md) içindedir; yukarıdaki önceki görünüm turundan farklı olarak yayınlama ve keşif altyapısı da uygulanmıştır.

- Backend tam izole SQLite paketi **76 / 76 geçti**. Yeni paylaşım dosyasında 20 regresyon; demo veri/ayar dosyasında 10 regresyon vardır. Varsayılan özel kayıt, yöneticiyle sınırlandırılmış yayın kararı, başka tersaneye yazma engeli, güvenli ortak çıktı, pasif/atanmamış hesaplar, kapsam dışı türler, yayın kaldırma, sahip değişiminde izin sıfırlama, Excel'in yayını değiştirmemesi ve eski nesneyle kayıt sırasında güncel yayın kararının korunması sınandı.
- Django sistem kontrolü ve `makemigrations --check --dry-run` geçti. `0004_asset_sharing` yalnız izole yerel demoya uygulandı. Gerçek PostgreSQL eşzamanlılık/yük testi yapılmadı; SQLite'taki eski nesne regresyonları bunun yerine sunulmaz.
- Normal Chromium paketi **21 / 21 geçti**. Tür kartı → fiziksel ekipman, yalnız kayıtlı türlerin sayımı, eksik katalog metaverisi olan ekipmanın kaybolmaması, eski ek alanların ayrıntıda korunması, merkezi sahip filtresi, ortak tür dizini/kategori filtresi, özel envanter sorgulamayan ortak liste ve geçersiz son sayfadan toparlanma yeni senaryolardır. Önceki form/tema/Excel/klavye senaryoları da geçti.
- Gerçek demo Chromium paketi **6 / 6 geçti**. Yeni uçtan uca senaryoda tersane yöneticisi kurmaca bir ekipmanı arayüzden yayımladı; başka tersane hesabı yalnız açık notu gördü, iç kod/konum ve `custom_data`/atama alanları görünmedi; yönetici yayını kaldırdı ve karşı kurumda kayıt kayboldu. Test yalnız oluşturduğu ekipmanı temizledi; başlangıç kayıtları korundu.
- TypeScript ve production build geçti. Değişen envanter, tür, ortak liste, yayın penceresi, API/hook ve yardım dosyalarında hedefli ESLint temiz. Genel lint **76 hata / 5 uyarı** olan önceki kimlik/form borcunu taşır. Ana JavaScript paketi yaklaşık 933 kB; paket boyutu uyarısı sürer.
- Python, genel kod ve güvenlik incelemelerinde yeni açık bulgu kalmadı. Bulunan eski yayın kararını geri yazma yarışı, katalog aktarımında ortak liste önbelleğinin güncellenmemesi ve azalan kayıtlarda son sayfadan dönüş sorunları düzeltildi.
- Son `capture-interface.mjs` çalıştırması **47 görünümü** başarıyla yakaladı: 1440 px masaüstü ve 390 px mobilde açık/koyu ana sayfalar, türden ekipmana geçiş ve ortak liste; ayrıca tersane yöneticisinin kendi envanteri/ekipmanları/ortak listesi. Beklenen rotalar, sayfa taşması ve koyu klavye odağı kontrol edildi. Temsilî envanter, ekipman, kategori dizini ve ortak liste görüntüleri incelendi.
- Güncel çevrimdışı rehber gerçek Chromium'da yeniden doğrulandı: 12 bölüm, 5 yerel görsel; 390 px taşma yok; arama, tema, yazdırma ve JavaScript kapalıyken okunurluk geçti. Dış istek ve JavaScript hatası yok. [Güncel rehber görüntüsü](images/offline-guide-sharing.png).

Yeni görünüm örnekleri: [tersanenin envanter türleri](images/inventory-types-desktop-light.png), [Forklift ekipmanları](images/inventory-equipment-desktop-light.png), [ortak ekipman listesi](images/shared-equipment-desktop-light.png). Tam saha uygunluğu, müsaitlik, talep ve rezervasyon bu dilimin tamamlanmış kapsamı değildir.

### Görev ve ekran odaklı rehber — son doğrulama

- `/help`, uzun tek sayfa yerine beş işlemden seçilen tek adımı gösterir: envanteri inceleme, ekipman ekleme, Excel aktarımı, yayınlama ve ortak tür kataloğu. TR/EN içerikte 21 kısa adım, ilgili sorular ve beklenen sonuç vardır. Seçilen işlem/adım URL'de korunur; arama bütün adımlar ve soruları tarar.
- Dokuz gerçek Türkçe demo ekranı `frontend/public/guide/images` altında uygulama rehberine eklendi. Form ve paylaşım taslakları dolduruldu, Excel yalnız önizlendi; görsel hazırlama sırasında kayıt/aktarım/yayın onaylanmadı. Görseller kurmaca veri olarak etiketlidir.
- Normal Chromium paketi **25 / 25 geçti**. Dört yeni rehber testi masaüstü/mobil adım gezinmesi ve tarayıcı geri dönüşü, arama, gerçek görsel yüklenmesi, zoom/Escape/odak dönüşü, yetkisiz işlem bağlantıları, geçersiz URL ve zoom açıkken tam rehber yazdırma davranışını kapsar.
- Gerçek demo paketi **6 / 6 yeniden geçti**; yeni yardım başlığı/arama/yazdırma beklentileri görev odaklı rehbere uyarlandı. Önceki giriş, Excel ve iki tersane arasında yayınlama/geri çekme akışları korunur.
- TypeScript, production build ve değişen rehber/ortak pencere dosyalarının hedefli ESLint kontrolü geçti. Genel lint borcu sürer; ana paket yaklaşık 964 kB. Son kod incelemesinde yeni bulgu kalmadı.
- `inspect-guide.mjs`, 1440 px masaüstü ve 390 px mobilde açık/koyu görünümü kontrol etti: bütün rehber görselleri yüklendi; yatay taşma ve JavaScript hatası yok. [Yeni uygulama rehberi](images/guide-new.png), [paylaşım adımı](images/guide-publish-new.png).
- Çevrimdışı HTML rehber beş görev ve beş yerel görselle yeniden düzenlendi; Markdown 572 kelimelik hızlı başvuruya indirildi. Gerçek Chromium'da masaüstü/mobil taşma, arama/temizleme, bağlantıdan soru açma, tema, filtrelenmiş/kapalı içeriğin tam yazdırılması ve JavaScript kapalı okunurluk geçti. Dış istek ve JavaScript hatası yok. [Çevrimdışı görünüm](images/guide-offline-new.png).

### E-posta ile giriş ekranları — son doğrulama

- `/login/code` ve doğrulama ekranı aynı kurumsal iki adımlı düzene taşındı. İç içe tam ekran yüksekliği kaldırıldı; TR/EN metinler, bağlı e-posta etiketi/açıklaması, görünür yükleme metni ve erişilebilir hata bildirimleri eklendi. OTP kutuları dar ekranlarda küçülür; doğrulama açık düğmeyle yapılır ve eşzamanlı gönderimler engellenir.
- `login_by_code` bekleyen akışı doğrulama rotasına eşlendi. Kullanıcı şifreyle girişe dönebilir; aynı kod akışıyla dönen 401 hata olarak kalır, gerekli MFA akışına geçiş korunur. Kurulu Allauth kaynağıyla kontrol edilen gönderim sınırı ve 409 geçersiz giriş isteği için ayrı mesajlar vardır; geçersiz istekte yeni kod bağlantısı sunulur.
- Normal Chromium paketi **35 / 35 geçti** (25 mevcut + 10 kodla giriş senaryosu). Son limit/geçersiz istek eklemelerinin ardından odaklı kodla giriş paketi **12 / 12 geçti**. Bu testler kontrollü API yanıtları kullanır; gerçek e-posta teslimini doğrulamaz. Backend veya gerçek demo veri değiştirme testleri bu dilimde yeniden çalıştırılmadı.
- TypeScript, production build, yeni/değişen kodla giriş bileşenleri ve testlerin hedefli ESLint kontrolü geçti. Genel lint **72 hata / 4 uyarı** ile kapsam dışı borç taşır; ana JavaScript paketi yaklaşık 970 kB ve paket boyutu uyarısı sürer. Son genel kod incelemesinde yeni bulgu yok.
- Gerçek izole demoda 1440, 390 ve 320 px genişlikte iki ekranın açık/koyu **12 görünümü** kontrol edildi: yatay taşma, JavaScript hatası veya veri değiştiren istek yok. Görüntü hazırlarken kod gönderilmedi. [Kod gönderme](images/login-code-request-desktop-light.png), [mobil koyu doğrulama](images/login-code-confirm-mobile-dark.png).

### Son ürün kontrolü ve küçük düzeltmeler

- Mobil menüye e-posta, şifre ve iki faktör ayarları eklendi; kısa ekranda menü kaydırılabilir. İki faktör ayarları için mevcut yeniden kimlik doğrulama koruması sürer.
- Envanter Excel'inin başlık satırı ve atlama kuralları kapalı **Dosya düzeni** bölümüne taşındı; seçili değerler özette görünür. Sütun eşleme ve atlama/kaldırma kontrolleri adlandırıldı. İçe aktarma parametreleri ve kısmi başarı davranışı değişmedi.
- Silme ve paylaşım penceresinde ekipman kodu, tür ve sahip tersane gösterilir; kod yoksa tam kayıt UUID'si kullanılır. Bu kimlik yalnız özel yönetim pencerelerinde gösterilir; ortak API'nin izinli çıktısı genişletilmedi.
- Üretim ayarı artık eksik/boş veya `django-insecure-` önekli `DJANGO_SECRET_KEY` ile başlamaz. Geçerli yapılandırılmış anahtar değiştirilmez. Yalnız açık demo/test ayar modülleri yerel istisnadır. Yeni 7 test izole süreçte, gerçek hizmet adresi/kimlik bilgisi aktarılmadan bu davranışı sınar.
- Son backend paketi **83 / 83**, normal Chromium **41 / 41**, gerçek izole demo **6 / 6 geçti**. Django sistem ve migration tutarlılık kontrolleri geçti. TypeScript, production build ve değişen UI dosyalarının hedefli ESLint kontrolü temiz. Genel lint borcu **72 hata / 4 uyarı**, ana paket yaklaşık **973 kB**; bu kapılar tamamen temiz olarak raporlanmaz.
- Python, genel kod ve güvenlik incelemelerinde bu düzeltmeler için açık bulgu kalmadı. 9 gerçek rehber görseli taslak/önizleme üzerinden yenilendi; TR/EN rehber adımı ve çevrimdışı anlatım **Dosya düzeni** ile eşlendi. [Sade Excel ilk adımı](images/guide-inventory-import-file.png), [kimliği görünen paylaşım penceresi](images/guide-sharing-modal.png).
- Kalan pilot kabul işleri: veritabanınca korunan ekipman kimliği ve mükerrer çözümü; bütün envanter dosyası için kabul planı/hata raporu ve kaynak sınırları; onaylı tür eşlemesi. Sonraki ürün işleri: ortak listede izinli ayırt edici başlık, kapasite/birim/kurumsal iletişim; büyük özel envanter için sunucu sayfalaması; personel izin matrisi ve şema denetimi. Gerçek SMTP teslimi ve PostgreSQL eşzamanlılık/yük kabulü tamamlandı sayılmaz. Canlı dağıtım yapılmadı.

### Ekipman türlerinde kategori/kart hizası

- Kategori gruplarının ortak üç sütunlu ızgarası, uzun grubun komşularının altında boşluk bırakıyordu. Her kategori aynı genişlikte ayrı bölüm, içindeki kartlar masaüstünde üç, tablette iki, mobilde tek sütun olarak düzenlendi. Kategori sırası, filtreler, 24 kayıtlık sayfalama ve işlemler korundu.
- Kart başlıkları daralabilir; kapsam dışı rozeti kart içinde kalır. Aynı kart satırında metaveri ve işlem düğmeleri alt çizgide hizalanır; sabit kart yüksekliği kullanılmaz.
- Dört yeni geometri testi **1440 / 900 / 390 / 320 px** genişlikte geçti: dengesiz kategori sayıları, uzun metin/rozet, bölüm genişliği/sırası/boşluğu, düğme hizası ve taşma. Mevcut kategori filtreleme/detay testi de geçti; toplam **5 odaklı test**. TypeScript, production build ve ilgili sayfa/test dosyasının hedefli lint kontrolü geçti. Bu dilimde tam backend/demo test paketi yeniden çalıştırılmadı.
- Gerçek izole demoda altı açık/koyu ekran görünümü kontrol edildi; yatay taşma veya JavaScript hatası yok. Rehber katalog görseli yeni düzenle yenilendi; ekran hazırlamada yalnız taslak/önizleme kullanıldı. [Düzeltilen bölüm](images/catalog-aligned-detail.png), [mobil koyu katalog](images/catalog-aligned-mobile-dark.png).

### Teknik olmayan kullanıcılar için model ve adet görünümü

- Kullanıcının kararı: aynı modelden 50 ekipman tek satırda model/adet olarak görünür; liste açılınca 50 ayrı fiziksel kayda erişilir. Stok miktarı alanı eklenmedi veya fiziksel kayıtlar birleştirilmedi.
- Envanter başlangıcı tür kartları yerine aynı tür + marka + modelin adet satırlarıdır. Gruplama yalnız tanımlı marka/model alanlarını kullanır; farklı tür/markalar ayrı, eksik model açıkça belirtilir. Türkçe büyük/küçük harf ve üretici etiketi için dil seçimine bağlı olmayan eşleme uygulanır.
- Arama ve sahip tersane kapsamından sonra gruplanır; filtreli adetler eşleşen kayıt sayısını gösterir. Birden fazla sözcükle marka/model/kod araması desteklenir. İlk görünümde yarışan üç sayı kutusu kaldırıldı; model açılınca sade kod listesi ve 24 kayıtlık sayfalar vardır. Aynı model bilgisi her satırda tekrarlanmaz.
- Düzenle/paylaş/sil, kayıt başına **İşlemler** altında; paylaşım izni korunur. Menü Escape/dış tıklama/Tab ile kapanır, pencere odağı geri döner. Modeli düzenlenen kayıt yeni grubunda görünür kalır; yeni kayıt sonrası özete dönülür. Özel ve ortak API kapsamı genişletilmedi.
- `seed_demo --model-count-demo`, izole demoda 50 Toyota 8FD forkliftini ayrı kimlik/kodla, tek tersanede ve varsayılan özel ekler. Başlatıcı bu seçeneği kullanır; temiz demo toplam **83 ekipman**, seçenek olmadan **33**. Yeniden hazırlama mevcut kullanıcı düzenlemelerini korur.
- Son kontroller: **86 / 86 sunucu**, **57 / 57 normal Chromium**, **7 / 7 gerçek demo** testi geçti. Yeni model dosyasında 12 regresyon; 50 kayıt → tek grup → 24/24/2 liste, marka/tür/eksik model, Türkçe eşleme, birleşik arama, tersane filtresi, düzenleme sonrası görünürlük ve rol/menü davranışı kapsanır. Gerçek demo senaryosu 50 kalıcı örneğin sayısını ve tekil detayını veri yazmadan doğrular. Django sistem/migration kontrolü, TypeScript, production build ve ilgili dosyaların hedefli lint kontrolü geçti. Global lint borcu sürer; ana paket yaklaşık 976 kB.
- Genel kod ve Python incelemelerinde açık bulgu kalmadı. Gerçek demoda 1440/390/320 px ve açık/koyu görünümde özet/liste/menü kontrol edildi; taşma veya JavaScript hatası yok. Rehberin 9 gerçek görseli, TR/EN görev metinleri ve çevrimdışı anlatım yeni akışla eşlendi. [50 adet özeti](images/inventory-simple-desktop-light.png), [mobil görünüm](images/inventory-simple-mobile-light.png), [tek tek kayıtlar](images/inventory-simple-list-desktop-light.png).

### Adetli stok desteği ve özel kaynak dosya kabulü

- Kullanıcının özel olarak sağladığı kaynak `.xlsx` yalnız okundu. Stok kodu/adı/adedi ile isteğe bağlı kaynak metadata alanlarının korunması, sıfır miktarın geçerli kabul edilmesi ve aktarım kopyasının kaynakla tutarlılığı kontrol edildi. Kaynak kimliği, özel değerler, dosya özeti ve ayrıntılı kabul dökümü Git tarafından yok sayılan yerel özel notlarda tutulur. Bu kayıt, özel dosyayla yapılan kabulü bildirir; aşağıdaki kurmaca belge örneğinin test edildiği anlamına gelmez.
- `AssetType.tracking_mode` açık `individual` / `stock` ayrımı sağlar; migration `0005` mevcut türleri individual olarak korur. Stokta zorunlu malzeme kodu/adı ve tam sayı adet doğrulanır. Sıfır kabul edilir; negatif, kesirli ve JavaScript güvenli tam sayı sınırının dışındaki adet reddedilir. Form ve iki import yolu aynı doğrulamayı kullanır; kaynak date/ID sistem kimliği/tarihine geçirilmez.
- Stok özeti malzeme adı, yerel kod ve adet gösterir; doğrudan ayrıntıya açılır. Merkezde sahibi tersane görünür. Yerel kodlar tersaneler arasında otomatik ortak kimlik sayılmaz; stok kayıtları birleştirilmez. Toplam kalem/parça sayısı fiziksel ekipman kayıt sayısından ayrılır. Genel `quantity` alanı bulunan individual türlerin önceki anlamı korunur.
- Export başlığı 1. satır, veri 2. satır olduğundan ham Excel yolu kullanılır. Stok türünde `Seri Numarası/İsim/Adet` başlıkları otomatik eşlenir. Kaynak tersane yalnız bildirim alanı olarak eşlenebilir; sahiplik atamaz. Tekrar aktarım adedi mevcut değerin üzerine eklemez, yeni değerle değiştirir; yeni kayıt özel başlar.
- Tür değişimi/kayıt yazımı aynı güncel tür kilidini kullanır; eski şemayla doğrulanmış istek yazma öncesinde yeniden doğrulanır. Mevcut türün formda takip biçimi değiştirilemez; şema/eşleme alanı kazara bozulmaz. Genel kod ve Python incelemesinde bulunan bu iki davranış sorunu regresyonlarla kapatıldı; son incelemelerde açık bulgu yok.
- Demo için açık kaynak dosya parametreli `seed_stock_sample` eklendi. Yalnız izole SQLite/demo ayarı; bütün dosya işlem öncesi doğrulanır, yeni kayıtlar tek transaction içinde oluşturulur. Özel kaynakla ayrı bir yerel kurumda stok kabulü yapıldı. Tekrar hazırlama mevcut düzenlemeleri ve yayın kararlarını korur. Kaynak Excel, aktarım kopyaları ve kaynak veriyi içeren kabul notları `var/demo` altında Git tarafından yok sayılır; üretim veritabanı veya canlı sunucu değiştirilmedi.
- Son backend tam paketi **110/110** geçti; sistem ve migration tutarlılığı temiz. Normal Chromium tam paketi **63/63** geçti; son eklemelerle odaklı stok paketi **9/9** geçti (önceki altı + türü koruma, stok türü oluşturma, export sütun eşleme). Toplam **66 farklı normal senaryo** doğrulandı. Gerçek izole demo tam paketi **10/10** geçti; stok sayısı/özel durum/ayrıntı/odak/taşma 1440 açık, 390 açık ve 320 koyu görünümde doğrulandı. Stok demo testleri opsiyonel örnek yoksa açık gerekçeyle atlanır; bu çalışmada üçü de çalıştı ve geçti.
- Production build, TypeScript, değişen TS/TSX dosyaları ve yeni testlerin hedefli ESLint kontrolü geçti. Genel ESLint borcu **72 hata/4 uyarı** olarak sürer; formal TypeScript uzman incelemesi bu genel kapıda durdu, onay olarak raporlanmaz. Genel davranış incelemesi ve Python incelemesi onaylandı. Ana JavaScript paketi yaklaşık **990,51 kB**, paket boyutu uyarısı sürer.
- Uygulama TR/EN rehberi, Markdown ve çevrimdışı HTML anlatımına ekipman/stok ayrımı eklendi. Herkese açık örnekler açıkça kurmacadır: `ORNEK-STOK-01` 500, `ORNEK-STOK-02` 250 ve `ORNEK-STOK-03` 0 adet; toplam 3 kalem ve 750 parça. Aktarım adımları ve kalan GAP'ler [STOK_AKTARIMI_ORNEGI.md](STOK_AKTARIMI_ORNEGI.md) dosyasında. Açık işler: ortak malzeme sözlüğü/yerel kod eşlemesi, veritabanında kod tekilliği, bütün envanter dosyası için kabul planı, paylaşılabilir miktar, stok hareketi ve kesirli birimler. PostgreSQL altında eşzamanlılık/yük kabulü ve gerçek üretim dağıtımı yapılmadı.

### Bildirimler, canlı SMTP ve isteğe bağlı iki faktörlü giriş

- Kullanıcı kararı: iki faktörlü giriş bütün hesaplarda isteğe bağlı. SMTP canlıda kullanılacak; yerel demo/test dışarıya e-posta göndermez. Demo başlangıcında devralınmış SMTP adresi, kullanıcı/parola ve canlı şifreleme anahtarları temizlenir. Console davranışı, farklı backend ayarı verilse bile korunur.
- Excel aktarımı işlemi yapan kişiye tek sonuç özeti üretir. Gerçek paylaşım değişikliği yalnız sahibi tersanenin aktif yöneticilerine bildirilir. İş bildirimlerinde doğrulanmış e-posta, aktif hesap/tersane ve kullanıcının e-posta tercihi denetlenir. Güvenlik uyarıları bu tercihten bağımsızdır; e-posta değişiminde Allauth'ın belirttiği önceki alıcı korunur.
- Kalıcı gönderim kaydı, işlem tamamlandıktan sonra Celery'ye alınır. Kuyruk/Redis kesintisi envanter işlemini geri almaz. Her 60 saniye kurtarma taraması, geçici hatalarda en fazla üç SMTP denemesi ve süresi geçmiş gönderim kilidini kurtarma vardır. Kalıcı ayar/kimlik doğrulama hataları otomatik yeniden gönderilmez. SMTP kabulünden sonra süreç kesilmesinde mükerrer teslim ihtimali dokümante edildi; kesin tek teslim garantisi verilmez.
- Giriş, doğrulama, parola/e-posta değişimi, parola sıfırlama, TOTP, kurtarma kodu ve güvenlik anahtarı bildirimlerine TR/EN HTML ve düz metin şablonları eklendi. HTML kullanıcı metinlerini kaçışlar; bağlantılar yapılandırılmış uygulama adresinde kalır. Güvenlik bildirimlerinde OTP, TOTP sırrı ve kurtarma kodları bulunmaz. SMTP arızası iki faktör kurulumunu kesmez; güvenlik uyarısı kuyrukta kalır.
- SMTP ekranı parola saklama/temizleme davranışını, TLS/SSL seçimini, doğrulama yönlendirmesini ve kalıcı işlem sonucunu açık gösterir. Parola geri okunmaz; yeni SMTP ve MFA sırları ayrı anahtarlarla şifrelenir, eski kayıtlar okunabilir kalır. Etkin ikinci faktörü olan kişi SMTP değişiminde onu doğrular; 2FA açmamış kullanıcıya kurulum zorlanmaz. Sunucudan gelen yeniden doğrulama yanıtında hassas işlem otomatik tekrarlanmaz.
- Parola sıfırlama sunucuda 8 karakterli harf/rakam kodu üretirken eski ekran 6 karakter kabul ediyordu. Ekran 8 karaktere ve mobil harf girişine uyarlandı. Başarılı fakat oturum açmayan `401`, yalnız açıkça tamamlanmış `password_reset_by_code` akışıyla kabul edilir; yanlış, kısaltılmış veya hâlâ bekleyen kod başarı sayılmaz. Gerçek e-posta koduyla parola değişimi ve etkin TOTP'nin korunması sunucuda sınandı.
- Tam izole backend paketi **199/199**, tam normal Chromium paketi **93/93 geçti**. Django sistem kontrolü ve migration tutarlılığı temiz. Parola sıfırlama/giriş için **17/17 odaklı tarayıcı testi** de geçti. Son gerçek izole demo paketi **10/10 geçti**; gerçek oturumla bildirim/e-posta tercihi ve önceki envanter/stok senaryoları korundu. Testler dış SMTP'ye bağlanmadı.
- TypeScript ve production build geçti. Ana JavaScript paketi **992,97 kB**; boyut uyarısı sürüyor. Değişen dosyaların hedefli lint kontrolleri temiz; son genel lint **48 hata/3 uyarı** ile önceki kimlik doğrulama/form altyapısı borcunu taşıyor. Backend Python ve bağımsız genel/güvenlik incelemelerinde bu kapsam için açık bulgu kalmadı. Formal TypeScript uzman incelemesi global lint borcunda durdu; onay olarak raporlanmaz.
- Dört gerçek şablonun sentetik içerikle **8 masaüstü/mobil görünümü** kontrol edildi; 320 px'de yatay taşma yok. Masaüstü giriş ve mobil parola sıfırlama görselleri incelendi. Gönderimsiz önizleme `var/demo/mail-preview/index.html` altında; kurulum/kullanım [BILDIRIM_EPOSTA_2FA.md](BILDIRIM_EPOSTA_2FA.md) içinde.
- Canlı SMTP sağlayıcısı, gönderici ve gerçek kimlik bilgileri verilmedi. Canlı dağıtım, sağlayıcıya gerçek gönderim, gelen kutusu/spam ve üretim yükü doğrulanmış değildir. Başarısız kalıcı gönderimleri arayüzden tekrar gönderme işlemi bu kapsamda eklenmedi.

### Kullanım rehberi giriş sonrasında

- `/help` adresi korunarak rehber korumalı rota grubuna taşındı. Giriş ve karşılama ekranlarında, oturumsuz üst menüde ve demo şeridinde rehber bağlantısı kaldırıldı; oturum açmış kullanıcının masaüstü/mobil menüsü ve ana ekran bağlantıları korunuyor.
- Doğrudan rehber bağlantısı önce giriş ister; görev, adım ve URL parçası dönüş adresinde korunur. Oturum iptali bildirimi geldiğinde korumalı sayfa içeriği hemen gizlenir ve girişe yönlenir. Rehber içeriği ve rol bazındaki işlem izinleri değişmedi.
- Rehber, giriş kodu ve menü akışlarının **24/24 odaklı Chromium testi** geçti. Dört yeni senaryo misafir masaüstü/mobil bağlantıları, seçili adıma giriş sonrası dönüş ve açık rehberde oturum iptalini kapsar. Gerçek yerel demoda ilgili giriş/rehber senaryosu **1/1 geçti**; oturumsuz demo şeridi de kontrol edildi.
- TypeScript, production build ve rehber/menü/test dosyalarının hedefli ESLint kontrolü geçti; görüntü kontrol script'inin sözdizimi temiz. Bağımsız genel/güvenlik kod incelemesinde yeni bulgu yok. Formal TypeScript uzmanı kendi shell'indeki eski Node nedeniyle lint kapısında durdu ve onay vermedi; ana kontrolde desteklenen Node 22 kullanıldı. Bu küçük dilimde backend ve bütün tarayıcı paketi yeniden çalıştırılmadı. Önceki genel lint borcu ve paket boyutu uyarısı sürüyor.
- Kullanım metni güncellendi; rehber görüntülerini kontrol eden script korumalı rehberi açmadan önce demo hesabıyla giriş yapıyor.

### GitHub yayın hazırlığı ve üretim imajları

- Son yayın adayı için tam backend **199/199**, normal Chromium **97/97**, gerçek izole demo **10/10 geçti**. Demo kaynak verileri ve gerçek e-posta ayarları üretime taşınmadı; dışarıya SMTP gönderimi yapılmadı. Test kapsamı yüzdesi bu çalışmada ayrıca ölçülmedi.
- Python `uv lock --check --offline` ve pnpm 11.19.0 donmuş kilit kontrolü geçti. Her iki üretim Dockerfile'ı yerel Linux ARM64 Docker ortamında başarıyla derlendi; backend imajında Django sistem kontrolü, frontend imajında Nginx yapılandırma kontrolü geçti. Üretim Compose yapılandırması sessiz doğrulamadan geçti. Canlı sunucuda build/dağıtım yapılmadı.
- Gerçek frontend üretim kurulumu esbuild yaşam döngüsü izni eksik olduğu için başarısızdı. `pnpm-workspace.yaml` yalnız esbuild'e izin verir; yerel/üretim Dockerfile'ları bu dosyayı kurulumdan önce kopyalar. Genel betik çalıştırma izni açılmadı.
- Üretim Nginx'te `/assets/types` statik dosya kuralına, `/assets` ise derleme klasörünün dizin kontrolüne takılıyordu. Statik dosyalar uzantıyla seçilir; uygulama rotaları dizin kontrolü olmadan `index.html` dosyasına düşer. Gerçek HTTP kontrolünde beş uygulama adresi yönlendirmesiz 200 ve `no-store`, derlenmiş JS bir yıllık cache, eksik JS 404 verdi. Geçici test konteyneri kapatıldı.
- GitHub Verify workflow'u uygulama test/build işlerine ek olarak Ubuntu'da iki gerçek üretim imajını derler; backend sistem kontrolü ve frontend Nginx/HTTP regresyon kontrolünü çalıştırır. Workflow yalnız `contents: read` yetkisine sahiptir; dağıtım veya gerçek SMTP işlemi yapmaz. Uzak workflow sonucu yerel sonuçlardan ayrı değerlendirilmelidir.
- Yeni kurulumun üretim varsayılanı uygulamadaki SMTP ayarını kullanan `DatabaseEmailBackend` oldu; gerçek SMTP alanları boş bırakıldı. [CANLI_GUNCELLEME.md](CANLI_GUNCELLEME.md), doğru Compose servis adlarıyla yedekleme, migration, worker/beat, mevcut anahtarların korunması ve kontrollü geri dönüş adımlarını anlatır. Medya arşivi için giriş script'inin çıktısı `--entrypoint tar` ile atlanır.
- Git/Docker kapsamı yerel ortam dosyaları, veritabanı, medya ve test çıktılarından ayrıldı. Projeyle ilgisiz üç yerel PDF Git kapsamına alınmadı; kaynak Excel ve üretilen demo dosyaları da yerelde kaldı. Yeni commit kapsamı için dosya/anahtar denetiminde canlı sır veya özel belge bulunmadı; bağımsız yayın/dağıtım kod incelemesi onaylandı.
- Genel frontend lint borcu ve yaklaşık 993 kB ana JavaScript paketi için boyut uyarısı sürer. Bunlar başarılı build ve davranış testleriyle karıştırılmaz. Gerçek SMTP teslimi ve PostgreSQL eşzamanlılık/yük kabulü halen ayrı canlı kabul işleridir.

### Kamuya açık depo için kaynak verinin ayrılması

- İlk GitHub gönderimi, kaynak Excel'den türetilmiş gerçek stok değerleri doküman, test ve bir ekran görüntüsünde kaldığı için otomatik onay incelemesinde reddedildi. Henüz gönderilmemiş commit temizlenerek hazırlanır; özel içerik taşıyan önceki yerel commit gönderilecek geçmişe dahil edilmez.
- Kamuya açık örnekler açıkça kurmaca üç satırla değiştirilmiştir: 500, 250 ve 0 parça. Özel kaynak kodları, miktar vektörü, toplam, tarih, kurum adı ve dosya parmak izi yayımlanacak metinlerden çıkarıldı. Önceki kabul/analiz notları `var/demo/private-source-notes/` altında Git dışında korunur. Kaynak Excel ve mevcut yerel envanter değiştirilmedi.
- Ana ekran görseli tamamen kurmaca API yanıtlarıyla yeniden hazırlandı. Demo testleri ve görüntü script'leri artık adayları yalnız Git dışında `var/demo/screenshots/` klasörüne yazar; özel deneme verisi otomatik olarak yayımlanan görsellerin üstüne yazılmaz. Bu yeni çıktı davranışı gerçek demo giriş/rehber senaryosunda doğrulandı.
- Stok testleri kurmaca kayıtlarla aynı sıfır, güncelleme ve tersane ayrımı davranışlarını sınar. İsteğe bağlı gerçek yerel örnek kontrolü kod/miktar/satır sayısını kaynak veriye sabitlemek yerine API yanıtından hesaplar. Temizleme sonrası **9/9 stok arayüzü** ve **3/3 isteğe bağlı yerel stok** kontrolü geçti; iki TS dosyasının hedefli lint kontrolü temiz.
- Demo stok hazırlama komutunun kurum adı ve kodu kurmaca varsayılanlara taşındı. `--tenant-slug` ile mevcut özel yerel örnek aynı kimlikte sürdürülebilir; isim verilmezse mevcut adı aynen korunur. Tekrar aynı açık adla çalışma ve elle yeniden adlandırılmış örneği kullanma ayrı regresyonlarla sınanır. Özel örnek otomatik yeniden hazırlanmadı.
- Kurmaca `Stok_ornek_aktarim.xlsx` (arayüz için iki sayfa) ve `Stok_ornek_export.xlsx` (demo hazırlama için tek sayfa) üretildi; üç satır, sıfır değer ve formül/hata hücresi bulunmaması doğrulandı. Tek sayfalı dosya stok okuyucusundan başarıyla geçti. Her iki dosya yerel `var/demo/samples/` altında kalır.
- Son temizlenmiş backend paketi **202/202 geçti**. Son tam normal Chromium sonucu **97/97**; kurmaca stok ve rehber metinleri için hedefli kontroller ayrıca geçti. Yerel demo tam paketi temizleme öncesinde **10/10**, temizleme sonrasında stok kontrolleri **3/3** ve güvenli görsel çıktısı kullanan giriş/rehber senaryosu **1/1 geçti**. Python ve bağımsız genel incelemelerde yeni açık bulgu kalmadı.

### GitHub Linux kurulumu

- İlk GitHub Verify çalışmasında backend **202/202** ve iki üretim imajı kontrolü geçti. Arayüzün npm kurulumu tamamlandı; build, kilit dosyasında Linux için `lightningcss` yerel paketi bulunmadığından durdu. Bu çalışmada normal tarayıcı testleri başlamadı; üretim imajının pnpm kurulumu ayrı olarak başarılıydı.
- npm kilidine `lightningcss`, Tailwind oxide ve esbuild için eksik 46 platform paketi ve gerekli 6 WASI bağımlılığı eklendi. Mevcut 314 paket kaydı, sürümler ve kök metadata aynen korundu; `package.json`, pnpm kilidi ve workspace ayarı değişmedi. Bağımsız inceleme onayladı; kilit dosyası farkı yalnız eklemelerden oluşur.
- Temiz ve izole **Linux x64, Node 22.23.3 / npm 10.9.9** ortamında `npm ci`, TypeScript kontrolü ve production build geçti. Geçici doğrulama image'ı kaldırıldı; yerel demo çalışmaya devam eder. Mevcut büyük JS paketi uyarısı sürer. Bu sonuç GitHub'daki yeniden çalışmanın sonucundan ayrıdır.

### Listelerde sayfalama

- Model/stok özeti tam filtrelenmiş envanter üzerinde gruplanır; ardından sayfalara ayrılır. Varsayılan 24 kalem, seçenekler 12 / 24 / 48. Aynı modelin 50 ekipmanı tek özet kaleminde ve doğru toplamla kalır; stok parça toplamları da sayfadan bağımsızdır. API'nin tam dizi yanıtları ve rapor kapsamı değiştirilmedi.
- Ekipman kayıtları ve katalogda 12 / 24 / 48, bildirimlerde sunucunun desteklediği 10 / 25 / 50 / 100 satır seçilebilir. Daha büyük sayfa seçilince seçim alanı kaybolmaz. Ortak ekipman listesinin sunucudaki 24 kayıt sınırı korunur. Tersane/kullanıcı tabloları mevcut 25 kayıt varsayılanını kullanır.
- Ortak sayfalama çubuğu etiketli kayıt aralığı, masaüstünde sayfa numaraları ve etkin sayfa, mobilde geçerli sayfa bilgisi, ilk/önceki/sonraki/son düğmeleri gösterir. Yükleme sırasında sunucu listelerinin kontrolleri kapatılır. TR/EN etiketleri, klavye odağı ve Enter/Space kullanımı doğrulandı; 320 ve 390 px taşma yok.
- Aynı sayıda farklı arama sonuçları tabloyu ilk sayfaya döndürür. Model özeti arama/tür/tersane değişince sıfırlanır. Silme veya yenilemede sayfa küçülürse son geçerli sayfa kalıcı olarak tutulur; veri yeniden artınca eski sayfaya atlanmaz. Katalog kategori sayacı sayfa dilimini değil tam filtrelenmiş kategori toplamını gösterir. Ortak listede silinmiş sayfadan ilk sayfaya dönüş korunur.
- **18 yeni odaklı**, **115/115 tam normal Chromium** ve **10/10 gerçek yerel demo** senaryosu geçti. Demo stok kontrolleri bu çalışmada atlanmadı. TypeScript, production build ve değişen TS/TSX dosyalarının hedefli ESLint kontrolü geçti. Bağımsız genel incelemenin iki bulgusu giderilip yeniden onaylandı.
- Formal TypeScript incelemesinin tüm depo lint kapısı mevcut **48 hata/3 uyarı** nedeniyle onay vermedi; değişiklik kapsamı lint hatası eklemedi. Ana JS paketi yaklaşık **996 kB**, boyut uyarısı sürer. Backend değişmedi; önceki GitHub tam backend sonucu **202/202**. Canlı dağıtım ve gerçek SMTP teslimi yapılmadı.
- Uygulama içi TR/EN anlatım, hızlı Markdown ve çevrimdışı HTML rehberi sayfa geçişi ve satır sayısı seçimini açıklar. Görsel kontrol yerel demoda yapıldı; özel kaynak değerleri ve demo çıktıları Git kapsamına alınmadı.

### Excel dosyasında otomatik öneri ve kontrollü aktarım

- Envanter aktarımı görünür çalışma sayfalarını ve ilk 50 satırdaki başlık adaylarını inceler; sayfa, başlık, sütun eşlemesi ve mevcut ekipman türü önerir. Öneri önizlemede düzenlenebilir. Aynı derecede uygun türler, belirsiz başlık/sayfa ve karışık türler kullanıcı kararını gerektirir; yeni tür veya sahip tersane Excel'den otomatik oluşturulmaz.
- Boş satırlar, tekrarlanan başlıklar, birleştirilmiş bölüm başlıkları ve yapısı toplam olduğunu gösteren satırlar gerekçeleriyle ayrılır. Toplam atlama için sayısal yan hücre veya toplama formülü kanıtı gerekir. Adında “toplam” geçen gerçek malzeme, gerçek `TOTAL` kodu, boş isteğe bağlı alan ve sıfır stok korunur. Kullanıcının ayrıca yazdığı atlama kuralları açık tercihtir; varsayılan geniş `TOPLAM`/`TOTAL` filtresi yoktur.
- Bütün seçili sayfa kontrol edilir; ilk 50 veri satırı fiziksel Excel satır numarasıyla örneklenir. Eksik zorunlu alan, hatalı değer, Excel hatası/formül ve mükerrer kimlik işaretlenir. İlk mükerrer satır da incelemeye dahil edilir; aynı modelin farklı kodlu 50 ekipmanı mükerrer sayılmaz. Kullanıcı Excel'i düzeltip yeniden yükler veya işaretli satırların tümünü açıkça hariç tutar.
- Yeni arayüz `require_review=true` ile kayıttan önce yeniden kontrol ister. Açık sorun varsa hiçbir satır yazılmaz. Dosya, tür, eşleme, sayfa, başlık veya atlama kuralı değişince önceki onay kalkar; yeniden kontrol gerekir. Eşzamanlı yanıtlar eski öneriyi geri getiremez. Şablon aktarımı da aynı sayfa/başlık/eşleme/atlama planını kullanır ve atlanan satır sayısını sonuçta gösterir.
- Aynı tersane ve türdeki stok kodu tekrar yüklenince miktar önceki değere eklenmez, güncellenir. Excel'in tersane sütunu sahipliği değiştirmez. Eski API istemcilerinin satır bazında kısmi başarı davranışı korunur; bütün dosyayı tek veritabanı işlemiyle kaydetme ve eşzamanlı benzersizlik garantisi bu çalışmanın kapsamı değildir.
- Dosya sınırları: 5 MB yükleme, 30 MB açılmış ZIP, 20.000 fiziksel satır, 256 sütun, 32 sayfa, 512 ZIP kaydı ve toplam 1.000.000 hücrelik gerçek XML alanı. Limitler dosya kırpılmadan, hücreler belleğe alınmadan denetlenir. Yanıltıcı boyut metadata'sı, tekrar worksheet XML bağlantıları ve geçersiz hücre koordinatları için regresyonlar vardır.
- Son tam backend **231/231**, normal Chromium **125/125**, güncel kodla gerçek yerel demo **12/12 geçti**. Yeni davranış için **29 backend**, **10 arayüz** ve **2 gerçek demo** senaryosu eklendi. Gerçek Excel'de otomatik sayfa/başlık, üç stok kalemi ve dört atlanan satır, sıfır adet, adında “toplam” geçen malzeme ve tekrar aktarımda 0 yeni/3 güncelleme doğrulandı; kurmaca toplam 750 olarak kaldı. Sorunlu örnekte dört satır karar bekler; katı API önkontrolü 400 döndürür ve envantere sıfır kayıt yazar. Geçici kurmaca tür/kayıtlar temizlendi; mevcut envanter kimlikleri ve güncelleme tarihleri değişmedi.
- Django sistem/migration tutarlılığı, TypeScript, son üretim derlemesi ve değişen TS dosyalarının hedefli ESLint kontrolü geçti. Son küçük giriş/rehber metni düzeltmelerinden sonra üretim derlemesi ve gerçek demo yeniden geçti; tam normal tarayıcı paketi bu metin düzeltmelerinden önce çalıştı. Demo sunucusu `--noreload` ile eski kodu tuttuğu için ilk yeni test denemesi yalnız önizlemede durdu; servisler mevcut veritabanı/dosyalar korunarak, yeniden veri üretmeden yenilendi ve son 12 senaryo atlanmadan geçti.
- Bağımsız genel ve Python incelemelerinde bildirilen sorunlar giderilip onaylandı. Formal TypeScript incelemesinin tüm depo lint kapısı mevcut **48 hata/3 uyarı** nedeniyle onay vermedi; Excel kapsamı lint kontrolü temiz. Ana JS paketi yaklaşık **1.014 kB**, mevcut boyut uyarısı sürer. Canlı dağıtım ve gerçek SMTP gönderimi yapılmadı.
- Kullanım rehberinin uygulama içi TR/EN adımları, hızlı Markdown ve çevrimdışı HTML anlatımı öneri, yeniden kontrol ve manuel karar akışına uyarlandı. İki kurmaca Excel örneği yalnız yerel `var/demo/samples/` altında tutulur; kaynak Excel, özel stok verisi ve test çıktıları Git kapsamına alınmaz.

### Paylaşım bilgileri, önizleme ve stok kontrolü

- Yönetici paylaşımı ayrı yayın bilgileriyle düzenler: ortak listede görünen ad, paylaşım adedi, kapasite/ölçü, uygunluk ve açıklaması, mevcut paylaşım notu/koşullar, isteğe bağlı kişi/e-posta/telefon. Kaydetmeden önce diğer tersanenin göreceği önizleme vardır. Ortak kart ve detay penceresi aynı izinli yayın bileşenini kullanır; özel envanter API'sini sorgulamaz.
- Paylaşım adedi toplam stoktan ayrıdır. Adet boşsa sahibiyle görüşülür; “Kullanıma uygun” seçimi adet gerektirir. Stok türünde adet mevcut toplamı geçemez; tek tek izlenen ekipman kaydı için yalnız 1 kabul edilir. Boole, kesir, sıfır ve JavaScript'in güvenli tam sayı aralığını aşan değerler reddedilir. Özel malzeme adı/kodu, marka/model, toplam stok, hesap ve tersane iletişimi otomatik yayın bilgisine kopyalanmaz.
- Telefon ve tek satırlı alanlar ham kontrol karakterleriyle gönderilemez; e-posta modelle aynı 254 karakter sınırında doğrulanır. İletişim bağlantıları yalnız doğrulanan adres ve normalleştirilmiş telefonla oluşturulur. React metin kaçışı korunur. Bağlantı kullanıcının e-posta/telefon uygulamasını açar; otomatik mesaj veya rezervasyon oluşturmaz.
- Normal düzenleme ve iki Excel aktarımı kilitlenen güncel kayıtla birleşir. Stok paylaşım adedinin altına düşerse yayın kapanır; detaylar taslak kalır. Sonuçtaki `sharing_paused_count` kullanıcıya nedenini açıklar. Stok artışı yeniden yayınlamaz. Her gerçek ekipman türü değişikliği de yayını durdurur; aynı türün tekrar gönderilmesi yayın tarihini korur. Tersane değişimi bütün yayın bilgilerini ve kararı temizler.
- Yayını kaldırma yalnız `is_shared=false` gönderir; artık geçersiz olmuş eski adet veya kaydedilmemiş taslak kaldırmayı engellemez. Stok nedeniyle kontrol isteyen taslak listede “Paylaşım durduruldu · kontrol edin” olarak görünür. Başka tersane, personel ve sıradan envanter/Excel yazımının yayın alanlarını değiştirme sınırları korunur. Ortak aramaya açık başlık ve kapasite eklenmiştir; mevcut filtreler ve 24 kayıt sınırı korunur.
- `assets.0006_asset_sharing_details` yalnız alan ekler. Eski yayınlar boş yeni alanlar ve “Görüşülerek belirlenir” varsayılanıyla korunur. Testte ileri, geri ve tekrar uygulama mevcut özel stok, sahiplik, yayın/not/tarih verilerini korudu. Yeni uygulamadan önce migration tamamlanmalıdır; eski kod ek kolonlarla çalışabilir, geri migration yeni yayın detaylarını kaldıracağından canlıda uygulanmadı.
- Son backend **255/255 geçti**; **24 yeni paylaşım testi** vardır. Django sistem/migration tutarlılığı temiz. Yeni paylaşım arayüzünde **13/13**, mevcut UX ve sayfalama ile birleşik **33/33**, güncel altı adımlı rehberde **8/8** odaklı kontrol geçti. Son production build, TypeScript ve değişen dosyaların hedefli ESLint kontrolü başarılıdır.
- Son tam normal Chromium paketi **138/138**, gerçek yerel demo **13/13 geçti**; hiçbir demo senaryosu atlanmadı. Yeni gerçek paylaşım senaryosu, kurmaca 1.000 parçalık stoktan arayüzde 50 adet yayınlanmasını ve ikinci tersanenin yalnız açık bilgileri görmesini doğrular. Stok 20'ye düşünce yayın durur; 1.000'e dönüş yeniden açmaz. Yalnız oluşturulan geçici ekipman/tür silindi; kalan envanter/tür kimlikleri ve güncelleme tarihleri değişmedi. E-posta/telefon bağlantıları kullanılmadı; gerçek mesaj gönderilmedi.
- Rehber yetki testi yeni altı adımın sonuna uyarlandı. Mevcut bildirim tercih testi, sunucu tarafından kontrol edilen kutunun durumunu anında değişmiş varsaymak yerine gerçek PATCH yanıtını ve kaydedilen sonucu bekler; ürün davranışı değiştirilmedi. Hatalı kaydetme, güvenlik e-postası açıklaması ve okundu işaretleme hata kontrolleri korunur. Odaklı bildirim paketi **6/6 geçti**.
- Gerçek yerel demoda önce tutarlı SQLite yedeği alındı. Migration sonrası eski envanter alanları, yayın kararları/notları/tarihleri bire bir karşılaştırıldı; yeni açık alanların boş kaldığı doğrulandı. Demo veri hazırlama/sıfırlama yapılmadı. Yerel yedek, karşılaştırma verisi ve özel kaynaklar Git dışında kaldı.
- Üç Türkçe görünüm tamamen kurmaca API verileriyle hazırlandı: yayın formu, açık önizleme, karşı tersanenin detay ekranı. Kaynak envanter veya gerçek demo görüntüsü yayımlanmadı. Uygulama rehberi ve çevrimdışı HTML görselleri yenilendi. Çevrimdışı rehber 1440/390/320 px genişlikte altı paylaşım adımı, yeni görseller, JavaScript hatası ve yatay taşma açısından geçti.
- Python, genel kod ve güvenlik incelemeleri onaylandı; e-posta uzunluğu bulgusu ve tür değişikliği kuralı düzeltildi. Formal TypeScript tüm depo lint kapısı mevcut **48 hata/3 uyarı** nedeniyle onay vermedi; paylaşım kapsamı lint temiz. Ana JS paketi yaklaşık **1.037 kB**, mevcut boyut uyarısı sürer. İsteğe bağlı `npm audit` proje bağımlılık metadatasını npm'e göndermek için açık yetki olmadığı gerekçesiyle otomatik onayda reddedildi; bu ek tarama tamamlanmış sayılmaz. Bağımlılık sürümleri değişmedi.
- Canlı sistem için eşzamanlı migration ve `DuplicateColumn` teşhisi dağıtım rehberine eklendi. Bildirimlerin eski migration'ı değiştirilmedi; yalnız mevcut sütuna bakarak `--fake` veya sütun silme önerilmedi. Canlı dağıtım ve gerçek SMTP gönderimi bu çalışma tarafından yapılmadı.
