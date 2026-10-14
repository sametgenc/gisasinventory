# Canlı sistemi güncelleme

14 Ekim 2026 — mevcut Linux sunucusunda çalışan kurulum içindir. GitHub'a gönderilen kodu sunucuda çekip aşağıdaki işlemleri siz uygulayın. Bu çalışma canlı sunucuda dağıtım veya gerçek e-posta gönderimi yapmadı.

Komutları mevcut depo klasöründe, sırayla çalıştırın; bir adım başarısızsa sonraki adıma geçmeyin. Depo: `https://github.com/sametgenc/gisasinventory`, dal: `main`. Mevcut Compose proje adını/klasörünü koruyun; değişmesi farklı veri volume'ları oluşturabilir.

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

Bu geliştirmelerin migration'ları: `assets.0003`, `assets.0004`, `assets.0005`, `assets.0006_asset_sharing_details`, `settings.0002`, `user.0005`, `notifications.0002`, `notifications.0003`, `notifications.0004`. `migrate` bağımlılıkları ve kurulu Allauth/Celery migration'larını da sırayla uygular. İlk paylaşım migration'ında mevcut ekipmanlar özel kalır; `assets.0006` mevcut yayın kararını/notunu/tarihini değiştirmeden boş detay alanları ekler. Özel envanter veya tersane iletişimi otomatik yayımlanmaz. Mevcut türlerin takip biçimi korunur; 2FA zorunlu hale gelmez. Yeni uygulama API'lerini açmadan önce migration tamamlanmalıdır.

Migration aynı anda tek süreçte çalıştırılır. Web başlangıcı `MIGRATIONS=true` ile otomatik migration yapar; bu işlem sürerken ayrıca `exec web python manage.py migrate` başlatmayın. Aşağıdaki bakım adımları web/worker/beat'i durdurup tek geçici konteynerde migration'ı tamamlar, ardından uygulamayı açar. `notifications.0003` mevcut bildirimlere satır satır kimlik yazar; büyük eski tabloda uzun sürebilir ve tamamlanana kadar ilerleme satırı göstermeyebilir. Süre uzarsa işlemi tekrar başlatmak yerine veritabanı kilitlerini ve çalışan süreci kontrol edin.

Planda tarihsel `assets.0002_restructure_asset_types` veya `tenants.0002_remove_tenant_name_i18n_tenant_address_and_more` görünürse burada durup eski şemayı ayrıca değerlendirin. Bu dosyalar türün tersane alanını/eski tersane çeviri alanını kaldırır; tür adını global tekil yapar. Aynı adlı eski türler migration'ı engelleyebilir. Bunlar yalnız yeni alan ekleyen migration'lar olarak kabul edilmemelidir.

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

docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml run --rm --no-deps -e MIGRATIONS=false web python manage.py collectstatic --noinput
docker compose -f docker-compose.prod.yml up -d --force-recreate web frontend celeryworker celerybeat
```

Yedeklerin listelenmesi başarılı olmalı; bu kontrol ayrı bir veritabanında geri yükleme provasının yerini tutmaz. Medya yedeği komutu başlangıç script'ini atlar ve terminal tahsisini kapatır; böylece başlangıç mesajları ikili yedek çıktısına karışmaz. Migration hata verirse uygulamayı açmadan hatayı değerlendirin. Web başlangıcı ayrıca `collectstatic` ve `migrate` çalıştırır; elle uygulanan migration'lar tekrar veri üretmez. Worker ve beat başlangıcında `MIGRATIONS=false` kullanılır.

Canlıda `seed_demo`, `seed_stock_sample` veya `scripts/start-demo.sh` çalıştırmayın. Demo hesapları, örnek stok dosyaları ve yerel SQLite veritabanı canlıya taşınmaz. Volume silme, temiz kurulum ve veritabanı sıfırlama bu güncellemenin parçası değildir.

## 4. Servisleri ve kullanıcı akışını kontrol edin

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec web python manage.py check
docker compose -f docker-compose.prod.yml exec web python manage.py migrate --check
docker compose -f docker-compose.prod.yml exec celeryworker celery -A config inspect ping
docker compose -f docker-compose.prod.yml logs --tail=100 web celeryworker celerybeat traefik
```

Compose servis adları `web`, `frontend`, `celeryworker`, `celerybeat`, `postgres`, `redis`, `traefik` şeklindedir. PostgreSQL/Redis sağlıklı, diğerleri çalışıyor olmalı. Worker ping'e cevap vermeli; beat günlüğünde başlatma hatası olmamalı. Bekleyen e-posta kayıtlarını bulan görev `apps.notifications.tasks.retry_pending_notification_emails` her 60 saniyede çalışır; beat tek örnek olmalıdır.

Tarayıcıda kendi alan adınızdan giriş, özel envanter, türler, stok görünümü, ortak liste ve giriş sonrası kullanım rehberini kontrol edin. Mevcut hesap/tersane/ekipman kayıtlarının bulunduğunu doğrulayın. 2FA açmamış hesap normal girişini sürdürebilmeli; açmış hesap ikinci faktörünü tamamlamalıdır.

Canlı SMTP sağlayıcısı ve gerçek kimlik bilgileri bu çalışmada belirlenmedi. Platform yöneticisiyle **Hesap → Ayarlar** ekranında sağlayıcının sunucu, port, gönderen, kullanıcı/parola ve TLS/SSL bilgilerini girin; kayıtlı ayar ortam değerlerinin önüne geçer. TLS ve SSL birlikte açılmaz. Sağlayıcının istediği uygulama parolası ve SPF/DKIM/DMARC ayarlarını tamamlayın. **Test e-postası** işlemini canlıda kontrolünüzdeki adrese uygulayıp gelen kutusu/spam teslimini ayrıca doğrulayın. Yerel demo dışarıya e-posta göndermez. Ayrıntı: [BILDIRIM_EPOSTA_2FA.md](BILDIRIM_EPOSTA_2FA.md).

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
docker compose -f docker-compose.prod.yml up -d --force-recreate web frontend celeryworker celerybeat
```

Yeni migration'ları otomatik tersine çevirmeyin. Geri yükleme gerekiyorsa bakım aralığında veritabanı, medya ve aynı anahtarlarla ayrı bir kurtarma planı uygulayın; yedek zamanından sonraki değişikliklerin kaybını değerlendirin. Bu kılavuz veri silen geri yükleme/volume silme komutu vermez.

Yerel doğrulamalar üretim dağıtımı ve gerçek SMTP teslimi yerine geçmez. [VERIFICATION.md](VERIFICATION.md) son test sonuçlarını içerir. Genel frontend lint borcu sürüyor (son tam kayıt: 48 hata/3 uyarı); ana JavaScript paketi yaklaşık 993 kB ve boyut uyarısı var. Gerçek PostgreSQL eşzamanlılık/yük kabulü henüz yapılmadı; SQLite testleri bunu doğrulamaz.
