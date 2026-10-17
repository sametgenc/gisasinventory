# Canlı sistemi güncelleme

17 Ekim 2026 — mevcut Linux sunucusunda çalışan kurulum içindir. GitHub'a gönderilen kodu sunucuda çekip aşağıdaki işlemleri siz uygulayın. Bu çalışma canlı sunucuda dağıtım veya gerçek e-posta gönderimi yapmadı.

Komutları mevcut depo klasöründe, sırayla çalıştırın; bir adım başarısızsa sonraki adıma geçmeyin. Depo: `https://github.com/sametgenc/gisasinventory`, dal: `main`. Mevcut Compose proje adını/klasörünü koruyun; değişmesi farklı veri volume'ları oluşturabilir.

## Arayüzdeki bilgi nerede saklanıyor?

| Ekran / ayar | Asıl kaynak | Tam kurtarma için gerekli |
|---|---|---|
| Yönetim → Uygulama Ayarları → SMTP / E-posta Ayarları | PostgreSQL'deki tek SMTP ayar kaydı; parola şifreli | Veritabanı ve mevcut `SMTP_CREDENTIAL_KEY`; ayrı anahtar yoksa mevcut `DJANGO_SECRET_KEY` |
| Kullanıcılar, tersaneler, roller, envanter, türler, paylaşım ve talepler | PostgreSQL | Veritabanı; Excel çıktısı bunların tamamını içermez |
| Hesap güvenliği / iki faktörlü doğrulama | PostgreSQL'deki hesap ve MFA kayıtları | Veritabanı ve mevcut `MFA_CREDENTIAL_KEY`; ayrı anahtar yoksa mevcut `DJANGO_SECRET_KEY` |
| Geliştirme taleplerine eklenen dosyalar | Veritabanındaki dosya referansı ve `django_prod_media` volume'undaki içerik | Aynı zamana ait veritabanı ve medya yedeği |
| CAPTCHA ve üretim güvenlik ayarları | `.envs/.env.local` | Mevcut ortam dosyası ve Turnstile sağlayıcı ayarları |
| HTTPS alan adı ve sertifikalar | `.envs/.env.traefik`, Traefik yapılandırması, `traefik/acme` | Ortam/yapılandırma ve özel sertifika deposu |

Uygulamada yedek oluşturma veya geri yükleme ekranı yoktur. **Envanter çıktısı tam sistem yedeği değildir.** Tam yedek; veritabanı, medya, mevcut şifreleme anahtarları ve sunucu ayarlarını birlikte kapsar. SMTP kaydı yapılandırılmışsa uygulama bunu kullanır; kayıt yoksa ortamın `EMAIL_*` değerlerine döner. Bu önceliğin test ve normal gönderimde geçerli olması için aşağıdaki `DatabaseEmailBackend` ayarı gerekir.

## 1. Mevcut ayarları ve sürümü koruyun

```bash
git status --short
git branch --show-current
docker compose -f docker-compose.prod.yml ps

umask 077
deploy_backup="../gisasinventory-backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$deploy_backup"
git rev-parse HEAD > "$deploy_backup/previous-commit.txt"
cp -a .envs "$deploy_backup/envs"
tar -czf "$deploy_backup/acme.tar.gz" -C traefik acme
```

Dal `main` olmalı. İzlenen dosyalarda sunucuya özgü değişiklik varsa önce inceleyip koruyun; zorla sıfırlama yapmayın. Yedek klasörü deponun dışındadır ve sır içerir; erişimini sınırlı tutun, sunucu dışındaki güvenli yedeğinize de aktarın.

Üretim Compose dosyası **web, celeryworker ve celerybeat için `.envs/.env.local` okur**. Adında `local` bulunması demo ayarı olduğu anlamına gelmez. Bu dosyada:

- Mevcut `DJANGO_SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, SMTP kimlik bilgileri ve varsa `SMTP_CREDENTIAL_KEY` / `MFA_CREDENTIAL_KEY` değerlerini koruyun. `.envs/.env.postgres` ve `.envs/.env.traefik` değerlerini de koruyun.
- `DJANGO_DEBUG=False` olmalı; `DOMAIN` gerçek alan adınız olmalı ve Traefik ayarıyla eşleşmeli. Eksik/boş veya `django-insecure-` ile başlayan Django anahtarı üretimin başlamasını engeller.
- `EMAIL_BACKEND=apps.settings.email_backend.DatabaseEmailBackend` kullanın. Eski kurulumlarda doğrudan Django SMTP backend'i bulunabilir; bu değer uygulamada kaydedilen SMTP ayarlarının kullanılmasını engeller. Güncel kurulum şablonu doğru backend'i seçer ve gerçek SMTP sağlayıcısını sizin yapılandırmanızı bekler.

`.envs/.env.traefik` içinde `DOMAIN`, uygulamadaki gerçek alan adıyla aynı olmalı; `LETS_ENCRYPT_EMAIL` geçerli bir sertifika iletişim adresi içermelidir. Bu adres boşsa Traefik başlangıcı durur. Alan adının DNS kaydı bu sunucuya yönelmeli, 80/443 portları erişilebilir olmalıdır. Ortam dosyalarını veya tüm Compose çıktısını paylaşmayın; sır içerebilir.

Cloudflare Turnstile widget'ını gerçek alan adınıza tanımlayın. Mevcut `.envs/.env.local` dosyasına `TURNSTILE_ENABLED=true`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TURNSTILE_ALLOWED_HOSTNAMES` ekleyin. Üretim eksik anahtarlarla veya CAPTCHA kapalıyken başlamaz. Gizli anahtarı frontend'e, Git'e veya sohbete koymayın.

Üretim web, worker ve beat başlangıcı, veritabanına bağlanmadan ve migration çalıştırmadan önce `python manage.py check --deploy --fail-level WARNING` uygular. Güvensiz geliştirme ayarları ve üretim güvenlik uyarıları başlangıcı durdurur. Yerel demo bu başlangıç betiğini kullanmaz; mevcut MFA ve paylaşım tercihleri değişmez.

`CROSS_TENANT_SHARING_ENABLED` varsayılanı `false` olarak korunur. Bu durumda ortak ilanlar ve kullanım taleplerinin tersaneler arası erişimi kapalıdır; özel envanter çalışır. Bedelsiz ortak kullanım pilotunu açmak istediğinizde mevcut `.envs/.env.local` içinde açıkça `CROSS_TENANT_SHARING_ENABLED=true` belirleyin. Ayar web, worker ve beat için aynı olmalı; aşağıdaki yeniden oluşturma adımı yeni değeri uygular. Güncelleme bu anahtarı kendiliğinden açmaz.

Denetim kayıtları ve aktarım kuyruğu her zaman oluşturulur. HTTPS kolektörünüz hazır olduğunda `AUDIT_SIEM_ENABLED=true`, `AUDIT_SIEM_URL`, `AUDIT_SIEM_TOKEN` tanımlayın. Varsayılan aktarım JSON ve Bearer token kullanır; SIEM'e özgü adaptör ayrıca doğrulanmalıdır. Ayrıntı: [güvenlik doğrulaması](VERIFICATION.md#guvenlik-captcha-ve-siem).

Güncellemede `setup.sh --prod` çalıştırmayın: ortam dosyalarını yeniden yazar ve Django anahtarını yeniden üretir. `.env.prod.example` bir şablondur; mevcut dosyanın üzerine kopyalanmaz.

SMTP/MFA anahtarları boşsa mevcut sırlar `DJANGO_SECRET_KEY` üzerinden türetilen anahtarla okunur. Bu güncellemede boş anahtarlara yeni değer eklemeyin veya mevcut anahtarı değiştirmeyin; şifreli kayıtlar için ayrı, kontrollü bir anahtar geçişi gerekir. İlk kurulumda üretilmiş ayrı Fernet anahtarları da veritabanıyla birlikte yedeklenmelidir.

## 2. Kodu çekin, image'ları hazırlayın, migration planını okuyun

```bash
git pull --ff-only origin main
git rev-parse HEAD > "$deploy_backup/new-commit.txt"
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py check
docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py migrate --plan
```

Build, Python için `backend/pyproject.toml` + `uv.lock`, frontend için `pnpm-lock.yaml` kullanır. Backend image'ı web, worker ve beat tarafından ortak kullanılır; tüm servisleri aynı sürümle yeniden oluşturun.

Bu geliştirmelerin migration'ları: `assets.0003`, `assets.0004`, `assets.0005`, `assets.0006_asset_sharing_details`, **`assets.0007_sharedusagerequest_asset_inventory_code_and_more`**, **`assets.0008_batch_operation`**, `settings.0002`, `user.0005`, `notifications.0002`, `notifications.0003`, `notifications.0004`, `notifications.0005_notification_tenant_scope` ve `audit.0001`–`audit.0003`. `migrate` yalnız bekleyenleri ve kurulu Allauth/Celery bağımlılıklarını sırayla uygular. Daha önce `[X]` görünen migration'ları yeniden oluşturmayın veya `--fake` ile işaretlemeyin.

`assets.0008` adetle toplu ekipman eklemede tekrar gönderimi ayırt eden işlem tablosunu ekler. Mevcut envanter, kullanıcı, rol ve yayın kayıtlarını dönüştürmez. Güncel toplu ekleme ekranını açmadan önce bu migration da uygulanmış olmalıdır.

`assets.0007` kullanım talepleri tablosunu, boş yerel `inventory_code` alanını, şema revizyonunu ve ilgili kısıtları ekler. Mevcut `custom_data`, stok miktarı, tür şeması, zorunluluk tercihleri ve sahiplik korunur; eski envanter kodları otomatik taşınmaz. Yerel kodun veritabanı tekilliği yalnız dolu kodlarda aynı tersane ve tür için uygulanır. Mevcut yayınlar otomatik açılmaz; kaynak GISBIR dosyası ve demo kayıtları migration ile yüklenmez.

İlk paylaşım migration'ında mevcut ekipmanlar özel kalır; `assets.0006` mevcut yayın kararını/notunu/tarihini değiştirmeden boş detay alanları ekler. `notifications.0005` eski bildirimlerin tarihsel tersane kapsamını tahmin etmez; kapsamı bilinmeyen eski kayıtlar silinmeden gizlenir. Özel envanter veya tersane iletişimi otomatik yayımlanmaz. Mevcut türlerin takip biçimi ve bütün hesapların isteğe bağlı MFA tercihi korunur. Yeni uygulama API'lerini açmadan önce migration tamamlanmalıdır.

Migration aynı anda tek süreçte çalıştırılır. Web başlangıcı `MIGRATIONS=true` ile otomatik migration yapar; bu işlem sürerken ayrıca `exec web python manage.py migrate` başlatmayın. Aşağıdaki bakım adımları web/worker/beat'i durdurup tek geçici konteynerde migration'ı tamamlar, ardından uygulamayı açar. `notifications.0003` mevcut bildirimlere satır satır kimlik yazar; büyük eski tabloda uzun sürebilir ve tamamlanana kadar ilerleme satırı göstermeyebilir. Süre uzarsa işlemi tekrar başlatmak yerine veritabanı kilitlerini ve çalışan süreci kontrol edin.

Planda tarihsel `assets.0002_restructure_asset_types` veya `tenants.0002_remove_tenant_name_i18n_tenant_address_and_more` görünürse burada durup eski şemayı ayrıca değerlendirin. Bu dosyalar türün tersane alanını/eski tersane çeviri alanını kaldırır; tür adını global tekil yapar. Aynı adlı eski türler migration'ı engelleyebilir. Bunlar yalnız yeni alan ekleyen migration'lar olarak kabul edilmemelidir.

Çözüm önerileri ve geliştirme talepleri için **`platform_feedback.0002_platformfeedbackevent_alter_platformfeedback_options_and_more`** de uygulanır. Mevcut talepler ve dosyalar korunur; çözüm/fayda, durum geçmişi, öncelik, sorumlu ve tersane kapsamı eklenir. Eski kayıtların tarihsel tersanesi tahmin edilmez: kapsamı bilinmeyen eski kayıtlar yalnız platform yöneticilerine görünür. Yeni talepler gönderen kişinin mevcut tersanesiyle saklanır. Talep geçmişi bulunan tersanenin silinmesi yerine pasifleştirilmesi gerekir. Migration demo talebi oluşturmaz; mevcut kayıtları silmez.

## 3. Kısa bakım aralığında veri yedeği ve güncelleme

Kullanıcılara bakım aralığını bildirin. PostgreSQL ve Redis çalışır kalırken uygulama ve arka plan işleri durdurulur; böylece veritabanı/medya yedeği sırasında yeni uygulama yazımı olmaz.

```bash
docker compose -f docker-compose.prod.yml stop frontend web celeryworker celerybeat
docker compose -f docker-compose.prod.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$deploy_backup/database.dump"
docker compose -f docker-compose.prod.yml run -T --rm --no-deps --entrypoint tar web -C /app/resources/public -czf - media > "$deploy_backup/media.tar.gz"
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore --list < "$deploy_backup/database.dump" > "$deploy_backup/database-contents.txt"
tar -tzf "$deploy_backup/media.tar.gz" > "$deploy_backup/media-contents.txt"
test -s "$deploy_backup/database.dump"
test -s "$deploy_backup/media.tar.gz"
```

**Migration'a geçmeden önce geri yükleme kabulünü tamamlayın.** Yedeği PostgreSQL 16 araçlarıyla ayrı, geçici bir veritabanına; medyayı ayrı bir klasöre açın. Üretim veritabanını, Compose proje adını veya mevcut volume'ları hedef göstermeyin. Kurtarma ortamında worker/beat, SIEM aktarımı ve dış e-posta çalıştırmayın; önce yedeğin kendi şemasını doğrulayın, otomatik migration başlatmayın.

- Yedekle aynı zamana ait tablo/kayıt sayılarını ve bütünlük özetlerini karşılaştırın. Kullanıcı kimliği, rol/tersane/yetki ilişkileri, envanter sahipliği, yayın/talep durumları, SMTP/MFA ve denetim kayıtları korunmalı.
- Medya dosyalarının sayı, boyut ve içerik özetleri eşleşmeli; veritabanındaki dosya referanslarının karşılığı bulunmalı.
- Aynı anahtarlarla mevcut SMTP/MFA sırlarının açılabildiğini yalnız başarı/başarısızlık olarak kontrol edin; sırları, parolaları veya kurtarma kodlarını çıktıya yazmayın. İlgili kayıt yoksa bu kontrolü "uygulanamaz" olarak kaydedin.
- PostgreSQL denetim tablosunun değişiklik/silme korumalarını ve uygulama veritabanı rolünün yetkilerini ayrı kopyada doğrulayın.

Yalnız `pg_restore --list` veya `tar -tzf` başarısı geri yükleme kabulü değildir. Bu prova tamamlanmadıysa burada durun; aşağıdaki güncelleme adımlarına geçmeyin. Bakım aralığını erteleyecekseniz mevcut uygulama sürümünü yeniden açın ve sonraki denemede yeni, tutarlı yedek alın.

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py collectstatic --noinput
docker compose -f docker-compose.prod.yml up -d --force-recreate traefik web frontend celeryworker celerybeat
```

Yedeklerin listelenmesi başarılı olmalı; bu kontrol ayrı bir veritabanında geri yükleme provasının yerini tutmaz. Medya yedeği komutu başlangıç script'ini atlar ve terminal tahsisini kapatır; böylece başlangıç mesajları ikili yedek çıktısına karışmaz. Migration hata verirse uygulamayı açmadan hatayı değerlendirin. Web başlangıcı ayrıca `collectstatic` ve `migrate` çalıştırır; elle uygulanan migration'lar tekrar veri üretmez. Worker ve beat başlangıcında `MIGRATIONS=false` kullanılır. Traefik de yeniden oluşturulur: yeni günlük ayarları ve Docker soketinin kaldırılması ancak yeni konteynerde uygulanır; bu adım bağlantılarda kısa kesinti yaratır.

Canlıda `seed_demo`, `seed_stock_sample`, `seed_shared_usage_demo` veya `scripts/start-demo.sh` çalıştırmayın. Demo hesapları, örnek stok dosyaları ve yerel SQLite veritabanı canlıya taşınmaz. Volume silme, temiz kurulum ve veritabanı sıfırlama bu güncellemenin parçası değildir.

## 4. Servisleri ve kullanıcı akışını kontrol edin

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec web python manage.py check
docker compose -f docker-compose.prod.yml exec web python manage.py migrate --check
docker compose -f docker-compose.prod.yml exec celeryworker celery -A config inspect ping
docker compose -f docker-compose.prod.yml logs --tail=100 web celeryworker celerybeat traefik
```

Compose servis adları `web`, `frontend`, `celeryworker`, `celerybeat`, `postgres`, `redis`, `traefik` şeklindedir. PostgreSQL/Redis sağlıklı, diğerleri çalışıyor olmalı. Worker ping'e cevap vermeli; beat günlüğünde başlatma hatası olmamalı. Bekleyen e-posta kayıtlarını bulan görev `apps.notifications.tasks.retry_pending_notification_emails` her 60 saniyede çalışır; beat tek örnek olmalıdır.

Tarayıcıda kendi alan adınızdan giriş, özel envanter, türler, stok görünümü, ortak liste ve giriş sonrası kullanım rehberini kontrol edin. Mevcut hesap/tersane/ekipman kayıtlarının bulunduğunu doğrulayın. Normal tersane hesapları mevcut MFA tercihiyle giriş yapabilir. İki faktörlü giriş bütün hesaplarda isteğe bağlıdır. Hesap → Güvenlik üzerinden açılabilir. Yönetici için ayrıca zorunlu politika isterseniz ADMIN_REQUIRE_MFA=true ayarlayın; bu durumda yönetici API ve Django admin erişimi son 5 dakikada doğrulanmış birincil MFA faktörü gerektirir. Varsayılan ADMIN_REQUIRE_MFA=false önceki tercihinizi korur. Bu güncelleme mevcut oturumları iptal eder; tekrar giriş gerekir. Ortak ilan ve kullanım talepleri CROSS_TENANT_SHARING_ENABLED=false iken kapalıdır.

Önce test ortamında dinamik alan ve üç sayfalı Excel'i deneyin. Canlıya gerçek envanter aktarırken **Tür ve envanter dosyası → Dosyayı incele** sonucunu ve seçilen tersaneyi kontrol edin. GISBIR taksonomisi yalnız 175 tür içerir; stok oluşturmaz. B/C kararlarını tamamlayın; alanları yalnız gerektiğinde zorunlu yapın. Eksik kayıtlara toplu bildirim gönderileceğini ve “Güncelleme gerekli” filtresini kontrol edin.

Ortak kullanım açıldıysa iki gerçek tersane hesabıyla bedelsiz talep → sahibi tersane yöneticisinin onayı → teslim → iade akışını doğrulayın. Platform hesabı onay vermez. Başlangıç/iade günleri dahildir; onaylanan adet ayrılır ve teslim edilmiş adet iade kaydedilene kadar serbest kalmaz. Stok veya yayın adedini açık onayların altına düşürmek engellenmelidir. Muayene, taşıma ve operatör koşulları ayrıca doğrulanır; belge süresi otomatik denetlenmez.

Canlı SMTP sağlayıcısı ve gerçek kimlik bilgileri bu çalışmada belirlenmedi. Platform yöneticisiyle **Yönetim → Uygulama Ayarları → SMTP / E-posta Ayarları** ekranında sağlayıcının sunucu, port, gönderen, kullanıcı/parola ve TLS/SSL bilgilerini girin; kayıtlı ayar ortam değerlerinin önüne geçer. TLS ve SSL birlikte açılmaz. Sağlayıcının istediği uygulama parolası ve SPF/DKIM/DMARC ayarlarını tamamlayın. **Test e-postası** işlemini canlıda kontrolünüzdeki adrese uygulayıp gelen kutusu/spam teslimini ayrıca doğrulayın. Yerel demo dışarıya e-posta göndermez. Ayrıntı: [BILDIRIM_EPOSTA_2FA.md](BILDIRIM_EPOSTA_2FA.md).

HTTPS kabulünde gerçek alan adının sertifika zinciri/alan adı/süresi tarayıcıda geçerli olmalı; HTTP aynı alan adının HTTPS adresine yönlenmeli. Giriş sayfasında Turnstile görünmeli ve geçerli doğrulamayla giriş tamamlanmalı; eksik/geçersiz token ile korunan işlem reddedilmeli. `/api/auth/captcha/` yapılandırmasının açık olması tek başına gerçek Turnstile kabulü değildir. Bu dış servis kontrolleri ve yukarıdaki gerçek yedek provası bu çalışma sırasında canlı sunucuda uygulanmadı.

## 5. Sorun çıkarsa

Eşzamanlı migration sonrası `column "event_id" ... already exists` hatası ilk sürecin tamamlanıp diğerinin eski planla tekrar sütun eklemeye çalışması olabilir. Önce çalışan işlemi doğrulayın; aşağıdaki salt okunur kontrolleri kullanın:

```bash
docker compose -f docker-compose.prod.yml exec web python manage.py showmigrations notifications
docker compose -f docker-compose.prod.yml exec web python manage.py migrate --plan
```

`[X] 0003_notification_email_outbox`, `[X] 0004_notification_security_recipient` ve `No planned migration operations` birlikte görünüyorsa bu migration'lar kaydedilmiş ve bekleyen işlem kalmamıştır. İlgili migration işaretli değilse şema ile kayıt geçmişi ayrıca incelenmelidir; yalnız sütun mevcut diye `--fake` kullanmayın veya sütunu silmeyin.

Migration uygulanmadan önce durduysanız önceki commit'e dönüp o sürümün image'larını yeniden oluşturabilirsiniz; mevcut veritabanı ve anahtarlar korunur. Migration sonrasında önceki kodun yeni şema ve şifreli SMTP/MFA kayıtlarıyla uyumlu olduğunu doğrulamadan sürüm geri almayın. Özellikle eski kod yeni şifreli sırları okuyamayabilir. Yalnız uyumluluğu doğrulanmış sürüme dönüş için:

```bash
deploy_previous_commit="$(cat "$deploy_backup/previous-commit.txt")"
docker compose -f docker-compose.prod.yml stop frontend web celeryworker celerybeat
git switch --detach "$deploy_previous_commit"
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --force-recreate traefik web frontend celeryworker celerybeat
```

Yeni migration'ları otomatik tersine çevirmeyin. Geri yükleme gerekiyorsa bakım aralığında veritabanı, medya ve aynı anahtarlarla ayrı bir kurtarma planı uygulayın; yedek zamanından sonraki değişikliklerin kaybını değerlendirin. Bu kılavuz veri silen geri yükleme/volume silme komutu vermez.

Yerel doğrulamalar üretim dağıtımı ve gerçek SMTP teslimi yerine geçmez. Güncel birleşik sonuçlar ve yayın kararı [P0–P3 son doğrulama raporunda](P0_P3_SON_DOGRULAMA.md), önceki çalışma kayıtları [VERIFICATION.md](VERIFICATION.md) içindedir. Genel frontend lint kontrolü artık hata veya uyarı üretmiyor; ana JavaScript paketi boyut uyarısı sürüyor. Yerel PostgreSQL yarış testleri kullanım onayı ve kapasite kilitlerini kontrol eder. Hedef sunucudaki ayarlar, gerçek CAPTCHA ve SMTP teslimi, HTTPS, canlı yük kabulü ve yedekten geri yükleme provası ayrıca doğrulanmalıdır. Bu çalışma canlıya yayın yapmaz.
