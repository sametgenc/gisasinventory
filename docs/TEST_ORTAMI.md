# Yerel demo ve test ortamı

14 Ekim 2026

Bu ortam, farklı tersanelerin envanterlerini ortak ekipman türleri altında birleştirme, dinamik alanlar, Excel aktarımı ve bedelsiz ortak kullanımı denemek içindir. Gerçek backend, gerçek oturum ve kalıcı yerel veritabanı kullanılır; HTTP yanıtları taklit edilmez. Canlı sunucuya veya üretim veritabanına bağlanmaz.

## Açma ve durdurma

Proje klasöründe çalıştırın:

```bash
CROSS_TENANT_SHARING_ENABLED=true bash scripts/start-demo.sh
```

Hazır mesajı çıktıktan sonra [demo uygulamasını](http://127.0.0.1:5190) veya giriş sonrası [uygulama içi rehberi](http://127.0.0.1:5190/help) açın. Sunucular yalnız `127.0.0.1` üzerinde dinler; aynı bilgisayarda erişilir. Arka uç 8011, arayüz 5190 portunu kullanır. Portlardan biri doluysa başlatıcı veri hazırlamadan önce durur; mevcut demo oturumunu kapatıp yeniden deneyin.

`CROSS_TENANT_SHARING_ENABLED=true` yalnız bu yerel süreçte ortak ilanları ve kullanım taleplerini açıkça açar; canlı ortam dosyasını değiştirmez. Bu seçenek olmadan güvenlik varsayılanı kapalıdır; kendi envanterinizi inceleyebilirsiniz. CAPTCHA ayrı demo ayarında kapalıdır; üretimde Turnstile anahtarları gerekir. İki faktörlü giriş bütün hesaplarda isteğe bağlıdır; canlıda ayrıca yöneticiye zorunlu politika açılabilir.

Gerçek giriş ve aktarım doğrulaması için demo açıkken başka bir terminalde `cd frontend` ardından `npm run test:demo` çalıştırın. Senaryolar gerçek HTTP/CSRF/session, kurum görünürlüğü, aynı modelden 50 ekipmanı açıp inceleme, katalog onayı, tekrarlı ekipman aktarımı, paylaşım yayını/geri çekme ve mobil/yazdırma akışlarını kontrol eder. Yeni dinamik alan ve kullanım senaryolarının sonuçları [VERIFICATION.md](VERIFICATION.md) dosyasında ayrıca kaydedilir. Normal taklit API regresyonları `npm test` ile ayrı 5187 portunda çalışır.

Durdurmak için başlatılan terminalde **Ctrl+C** kullanın. Başlatıcı kendi iki sunucusunu kapatır. Veritabanı ve deneme dosyaları korunur; yeniden açınca mevcut değişiklikleriniz devam eder.

## İlk kuruluma gerekenler

Python 3.13+ ve Node 22.12+ gerekir. Başlatıcı proje içindeki `backend/.venv/bin/python` ve frontend bağımlılıklarını kullanır. Uygun Node bulunmazsa `DEMO_NODE_BIN` ile tam yol verilebilir.

Bağımlılıklar yoksa iki klasörde kurun:

```bash
cd backend
uv sync --locked
```

```bash
cd frontend
npm ci
```

Sonra proje klasörüne dönüp demo başlatıcısını çalıştırın. İlk bağımlılık kurulumu internet gerektirir; hazır ortamı kullanmak için PostgreSQL, Redis, Docker veya SMTP servisi açmanız gerekmez.

## Deneme hesapları

| E-posta | Rol | Kurum |
|---|---|---|
| `admin@demo.gisas.test` | Platform yöneticisi; `superuser` | Kuruma bağlı olmayan genel yönetim |
| `yonetici@demo.gisas.test` | Tersane yöneticisi | Mavi Körfez Demo Tersanesi |
| `personel@demo.gisas.test` | Tersane personeli | Mavi Körfez Demo Tersanesi |
| `diger@demo.gisas.test` | Tersane yöneticisi | Poyraz Demo Tersanesi |

İlk oluşturulan hesapların parolası `GisasDemo!2026`. İlk hazırlamada başka bir parola için:

```bash
CROSS_TENANT_SHARING_ENABLED=true DEMO_PASSWORD='YerelDeneme!2026' bash scripts/start-demo.sh
```

Bu seçenek yalnız yeni hesap oluştururken uygulanır; mevcut hesabın parolasını yeniden başlatma sırasında sıfırlamaz. Varsayılan parola kurmaca, yalnız bu bilgisayarda çalışan test hesapları içindir.

## Hazırlanan veriler

İlk boş kurulumda:

- 3 kurmaca tersane: Mavi Körfez, Poyraz, Çınar.
- 4 deneme hesabı.
- A–M kategorilerini kapsayan 15 ekipman türü; Forklift, KKD ve radyografi örnekleri dahil.
- 83 fiziksel ekipman: 30 özel örnek kayıt, 3 yayın örneği ve aynı modelden 50 özel forklift.
- Mavi Körfez'de **Toyota 8FD — 50 adet** örneği. Her forklift ayrı fiziksel kayıttır; `DEMO-FL-50-001`–`DEMO-FL-50-050` kodları ve farklı seri numaraları vardır. **50 adet**, kayıtların toplamını gösterir; her forkliftin **3 ton** kapasitesiyle veya ayrı stok miktarıyla karıştırılmaz.
- Ortak listede Mavi Körfez'den 3 ton forklift, Poyraz'dan 25 ton mobil vinç, Çınar'dan 50 ton hidrolik pres; her biri paylaşım notuyla yayınlanır.
- 12 örnek bildirim.
- 5 Excel deneme dosyası.

Başlatıcı `seed_demo --model-count-demo` seçeneğiyle 50 forklift örneğini de hazırlar. Bu seçenek olmadan komutun temel örneği 33 ekipmandır. Her iki kullanım da yalnız izole demo veritabanında çalışır. Veri hazırlama tekrar çalıştırılabilir; mevcut demo kayıtlarını silmez veya kullanıcı düzenlemelerini sıfırlamaz. Sabit kimlikler sayesinde 50 forkliftin kod, model veya notunu değiştirmeniz sonraki hazırlamada yeni kopya üretmez. Yayın örnekleri yalnız yeni oluşturulurken paylaşıma açılır: bir örneğin yayınını kaldırırsanız sonraki başlatmada otomatik yeniden açılmaz. Bu yüzden işlemlerden sonra ekipman ve yayın sayıları ilk kurulumdan farklı olabilir. 15 demo türü, PDF'deki 175 tipin eksiksiz veya doğrulanmış aktarımı değildir.

| Dosya | Akış |
|---|---|
| [katalog-gecerli.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-gecerli.xlsx) | Türleri önizleme; sonraki aktarımda aynı katalog koduyla mevcut tanım karşılaştırılır |
| [katalog-hatali.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-hatali.xlsx) | Katalog satır hataları; dosya kaydedilmez |
| [katalog-guncelleme.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-guncelleme.xlsx) | Aynı katalog koduyla mevcut/yeni değer karşılaştırması; ayrı güncelleme modu seçilmez |
| [envanter-forklift.xlsx](http://127.0.0.1:5190/demo/downloads/envanter-forklift.xlsx) | Forklift şablonu otomatik tanınır; kodla ekipman ekleme/güncelleme |
| [envanter-forklift-hatali.xlsx](http://127.0.0.1:5190/demo/downloads/envanter-forklift-hatali.xlsx) | Envanterin satır bazlı hata sonucu |

Bu beş eski dosya kendi aktarım senaryolarına aittir; üç sayfalı yeni şablon için uygulamada **Tür ve envanter dosyası → Boş Excel şablonu indir** kullanın. Kaynak GISBIR dosyası demo başlangıcında otomatik yüklenmez.

### Bedelsiz kullanım ve eksik bilgi denemesi

Temel demo hesapları hazırlandıktan sonra backend klasöründe çalıştırın:

```bash
CROSS_TENANT_SHARING_ENABLED=true .venv/bin/python manage.py seed_shared_usage_demo --settings=config.demo_settings
```

Komut yalnız ayrı SQLite demo veritabanında çalışır; üretim ayarını ve farklı veritabanı yolunu reddeder. Mevcut kayıtları silmez, demo kullanıcısının değiştirdiği kayıtları sıfırlamaz. Yeniden çalıştırmak aynı örneklerin kopyasını veya yeni durum bildirimlerini üretmez.

İlk hazırlamada Mavi Körfez sahibinde `DEMO-USAGE-001` türü ve **Deneme platformu** stok kaydı oluşur: kurmaca toplam 120 parça, paylaşım adedi 40. Poyraz'dan gönderilmiş üç talep **Onay bekliyor**, **Onaylandı** ve **Teslim edildi** durumlarını gösterir. `DEMO-UPDATE-001` türündeki bir kayıt zorunlu **Son kontrol tarihi** eksiktir; Mavi Körfez yöneticisi güncelleme bildirimi alır. Bu iki tür, iki kayıt ve üç talep temel başlangıç sayılarının üzerine eklenir. Kullanıcı işlemlerinden sonra durum ve sayılar değişebilir.

1. `diger@demo.gisas.test` ile **Kullanım talepleri → Gönderdiğim talepler** açın. Talep adedinin toplam stok yerine açıklanan paylaşım adediyle sınırlı olduğunu kontrol edin.
2. `yonetici@demo.gisas.test` ile **Gelen talepler** açın; bekleyeni onaylayın veya reddedin. Teslim edilmiş örnekte **İade al** kullanın. Gelecek tarihli onay için başlangıç gelmeden teslim yapılamaz.
3. Aynı tarih aralığına fazla miktarda ikinci talep gönderip onaylamayı deneyin; onay paylaşım adedini aşmamalı. Teslim edilmiş adet, planlanan iade tarihi geçmiş olsa bile iade kaydedilene kadar ayrılır.
4. Envanterde **Eksik bilgili kayıtları göster** kullanın. `DEMO-UPDATE-RECORD` kaydına **Son kontrol tarihi** girip kaydedin; güncelleme işareti kalkmalı.
5. Platform hesabıyla bir türde isteğe bağlı alan açın. Sonra zorunlu yaparak **Kaydetmeden önce kontrol** sayılarını ve ilgili yöneticiye toplu bildirimi inceleyin. Alan etiketi değişirken eski değer korunmalı.
6. Üç sayfalı şablonda kurmaca katalog kodu, isteğe bağlı alanlar ve aynı kodla bağlanan envanter satırları hazırlayın. Önizleme sırasında hedef tersaneyi kontrol edin. Bir hatalı satırla hiçbir kaydın değişmediğini, düzelttikten sonra bütün dosyanın birlikte uygulandığını doğrulayın.

## Nerede saklanır?

### İsteğe bağlı stok kabulü

Kurmaca stok alıştırmasında `var/demo/samples/Stok_ornek_aktarim.xlsx` dosyası uygulamanın **Ham Excel** aktarım ekranı içindir; **Stok** ve **Aktarım bilgisi** sayfaları vardır. Yerel demo hazırlama komutu `seed_stock_sample` ise tek sayfalı `var/demo/samples/Stok_ornek_export.xlsx` dosyasını kullanır. Bu dosyayla açıkça hazırlandığında **Örnek Stok Tersanesi** altında 3 kalem, toplam 750 parça görünür. `ORNEK-STOK-01` 500, `ORNEK-STOK-02` 250 ve `ORNEK-STOK-03` 0 adet tutar. Bu değerler gerçek envanterden alınmamıştır; stok alıştırması varsayılan demo başlangıç verisine otomatik eklenmez. Hazırlama komutu ve dosya eşlemeleri [kurmaca stok aktarımı örneğinde](STOK_AKTARIMI_ORNEGI.md) yer alır.

Kullanıcının ayrıca ve özel olarak sağladığı export ile ayrı bir yerel stok kabulü hazırlanabilir. Her dosya satırı bir malzemenin stok kaydıdır; stok adedi kadar fiziksel ekipman kaydına dönüştürülmez. Platform hesabında **Birleşik envanter → Tersane** filtresiyle hazırlanan kurum açılır. Yeni stok kayıtları özel başlar; diğer demo kurumlarının kayıtları korunur.

Bu özel kabul de varsayılan kurmaca veri setine dahil değildir; açıkça verilen kaynak dosyayla `seed_stock_sample --settings=config.demo_settings --file '/path/to/private-source.xlsx' --tenant-slug '<private-local-slug>'` komutu backend klasöründe çalıştırılır. Mevcut özel kurulum devam ettiriliyorsa onun yerel slug değerini kullanın; yeni kabul için farklı bir slug seçin. Kaynak dosya değiştirilmez. Tekrar hazırlama yeni kopyalar üretmez, elle yapılan değişiklikleri sıfırlamaz. Gerçek kaynak değerleri, dosya kopyaları ve mevcut yerel verinin örnekleri `var/demo/private-source-notes/` gibi Git tarafından yok sayılan özel konumlarda tutulur; herkese açık belgelerde yer almaz. Kurmaca belgedeki sayılar gerçek kaynak dosyayı tarif etmez.

| Konum | İçerik |
|---|---|
| `var/demo/demo.sqlite3` | Yalnız yerel demo veritabanı |
| `var/demo/downloads/` | Excel deneme dosyaları |
| `var/demo/media/` | Demo dosya yüklemeleri |
| `var/demo/private-source-notes/` | Özel kaynak kabul notları ve önceki analizlerin yerel yedeği; Git tarafından yok sayılır |
| `var/demo/backend.log` | Arka uç günlüğü |
| `var/demo/frontend.log` | Arayüz günlüğü |

Demo ayarı `DATABASE_URL` değerini kullanmaz. E-posta konsola yazılır, dışarıya gönderilmez; görevler yerel çalışır. Demo oturum çerezi üretim oturumundan farklı ad taşır. `DEBUG`, yerel gizli anahtar ve HTTP ayarları bu ortam içindir; üretim dağıtım ayarı değildir.

Verilerinizi korumak için demo klasörünü silmeden önce sunucuları durdurun ve gerekiyorsa yedeğini alın. Başlatıcı otomatik silme/sıfırlama yapmaz.

## Kontrol senaryoları

1. Platform hesabıyla **Birleşik envanter**; 15 ekipman türü ve 83 ekipmanın sahibi tersaneleriyle incelenmesi. Mavi Körfez yöneticisiyle **Envanterim → Forklift → Toyota 8FD — 50 adet** grubunu açıp ayrı ekipman kodlarını kontrol etme; diğer tersane hesabında bu özel grubun görünmemesi.
2. Katalogda geçerli dosya önizleme → onay → aynı kodlarla yeniden önizleme.
3. Hatalı katalogda satır hataları ve kapalı onay; hiçbir kayıt eklenmediğinin kontrolü.
4. Güncelleme dosyasında önceki/yeni değer; boş açıklama/gerekçe temizleme davranışının kontrolü.
5. Forklift envanterini aynı anahtarla yeniden aktarınca kayıt sayısının artmadığının kontrolü.
6. Mavi Körfez ve Poyraz hesapları arasında **Envanterim** ayrımı: başka kurumun özel ekipmanı ve teknik alanları görünmez.
7. **Ortak ekipmanlar** listesinde yalnız açık yayınların görünmesi; özel ekipman kodu, teknik alan, toplam stok ve atanan kişinin görünmemesi. Paylaşım formuna açıkça girilmiş kişi/e-posta/telefon görünür; hesap veya tersane iletişimi otomatik aktarılmaz.
8. Yöneticiyle **Envanterim → Forklift → Paylaşımı yönet**: özel bir kaydı yayınlama, diğer kurumdan sınırlı görünümünü kontrol etme, sonra yayını kaldırma. Ekipman kendi envanterinde kalır.
9. Personel hesabında katalog değiştirme ve paylaşım yönetme düğmelerinin görünmemesi; personelin ortak listeyi okuyabilmesi.
10. K kategorisi, C ön sınıfı veya kapsam dışı nedeni olan türlerin yayınlanamaması; pasif tersane ve sonradan kapsam dışı olan türün ortak listeden gizlenmesi.
11. Excel ile eklenen ekipmanın otomatik yayınlanmaması; sahibi tersane değiştirilen kaydın yayın ve notunun sıfırlanması.
12. Koyu/açık tema, mobil gezinme, klavyeyle form ve pencere kullanımı.

Yayın tek başına ekipman ayırmaz. Kullanım talebini yalnız sahibi tersanenin aktif yöneticisi onaylar; platform hesabı onay veremez. Talep/onay, teslim ve iade bu ortamda denenebilir; muayene, operatör ve saha uygunluğu uygulama tarafından otomatik doğrulanmaz. Kullanım bedelsizdir.

Backend regresyon testleri ayrı SQLite veya açıkça seçilmiş yerel PostgreSQL test veritabanını kullanır; normal arayüz testleri taklit API yanıtlarıyla çalışır. Demo veritabanını değiştirmezler. `test:demo` gerçek yerel demo veritabanında çalışır; senaryolara ait deneme kayıtlarını oluşturup temizler. PostgreSQL yarış testleri iki onayın çakışmasını, aktör/bildirim kilitlerinin uyumunu ve hata sonrası geri almayı kontrol eder; miktar/teslim sınırları ayrıca davranış testlerindedir. SQLite kilit davranışını tek başına doğrulamaz. Komutlar ve güncel sonuçlar: [VERIFICATION.md](VERIFICATION.md). Kullanıcı anlatımı: [KULLANIM_REHBERI.md](KULLANIM_REHBERI.md) ve uygulamaya giriş sonrası **Kullanım rehberi**.

## Görselleri hazırlama

Demo testleri ve görüntü hazırlama script'leri yeni ekran görüntülerini `var/demo/screenshots/` altında tutar; bu klasör Git tarafından yok sayılır. Özel kaynak envanteri demo ortamına aktarılmış olabilir; görüntüler otomatik olarak herkese açık rehbere yazılmaz. Rehber görsellerini yenilemek için yalnız kurmaca verilerle hazırlanan adayları inceleyip ilgili `docs/images/` veya `frontend/public/guide/images/` dosyasına kopyalayın. Özel envanter değerleri içeren görüntüleri yayımlamayın.
