# Yerel demo ve test ortamı

14 Ekim 2026

Bu ortam, farklı tersanelerin envanterlerini ortak ekipman türleri altında birleştirmeyi ve yalnız yöneticinin seçtiği ekipmanları ortak listede yayınlamayı denemek için hazırlanır. Katalog ve Excel akışları da çalışır. Gerçek backend, gerçek oturum ve kalıcı yerel veritabanı kullanılır; HTTP yanıtları taklit edilmez. Canlı sunucuya veya üretim veritabanına bağlanmaz.

## Açma ve durdurma

Proje klasöründe çalıştırın:

```bash
bash scripts/start-demo.sh
```

Hazır mesajı çıktıktan sonra [demo uygulamasını](http://127.0.0.1:5190) veya [uygulama içi rehberi](http://127.0.0.1:5190/help) açın. Sunucular yalnız `127.0.0.1` üzerinde dinler; aynı bilgisayarda erişilir. Arka uç 8011, arayüz 5190 portunu kullanır. Portlardan biri doluysa başlatıcı veri hazırlamadan önce durur; mevcut demo oturumunu kapatıp yeniden deneyin.

Gerçek giriş ve aktarım doğrulaması için demo açıkken başka bir terminalde `cd frontend` ardından `npm run test:demo` çalıştırın. Senaryolar gerçek HTTP/CSRF/session, kurum görünürlüğü, aynı modelden 50 ekipmanı açıp inceleme, katalog onayı, tekrarlı ekipman aktarımı, paylaşım yayını/geri çekme ve mobil/yazdırma akışlarını kontrol eder. Normal taklit API regresyonları `npm test` ile ayrı 5187 portunda çalışır. Güncel test sonuçları [VERIFICATION.md](VERIFICATION.md) dosyasındadır.

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
DEMO_PASSWORD='YerelDeneme!2026' bash scripts/start-demo.sh
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
| [katalog-gecerli.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-gecerli.xlsx) | Yeni tip oluşturma; sonraki aktarımda mevcut kodlar atlanır |
| [katalog-hatali.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-hatali.xlsx) | Katalog satır hataları; dosya kaydedilmez |
| [katalog-guncelleme.xlsx](http://127.0.0.1:5190/demo/downloads/katalog-guncelleme.xlsx) | Güncelleme modunda mevcut/yeni değer karşılaştırması |
| [envanter-forklift.xlsx](http://127.0.0.1:5190/demo/downloads/envanter-forklift.xlsx) | Forklift şablonu otomatik tanınır; kodla ekipman ekleme/güncelleme |
| [envanter-forklift-hatali.xlsx](http://127.0.0.1:5190/demo/downloads/envanter-forklift-hatali.xlsx) | Envanterin satır bazlı hata sonucu |

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
7. **Ortak ekipmanlar** listesinde yalnız yayınlanan üç örneğin türü, tersanesi, kategorisi, katalog kodu, paylaşım notu ve yayın tarihinin görünmesi; özel ekipman kodu/teknik alan/atanan kişi/iletişim bilgisinin görünmemesi.
8. Yöneticiyle **Envanterim → Forklift → Paylaşımı yönet**: özel bir kaydı yayınlama, diğer kurumdan sınırlı görünümünü kontrol etme, sonra yayını kaldırma. Ekipman kendi envanterinde kalır.
9. Personel hesabında katalog değiştirme ve paylaşım yönetme düğmelerinin görünmemesi; personelin ortak listeyi okuyabilmesi.
10. K kategorisi, C ön sınıfı veya kapsam dışı nedeni olan türlerin yayınlanamaması; pasif tersane ve sonradan kapsam dışı olan türün ortak listeden gizlenmesi.
11. Excel ile eklenen ekipmanın otomatik yayınlanmaması; sahibi tersane değiştirilen kaydın yayın ve notunun sıfırlanması.
12. Koyu/açık tema, mobil gezinme, klavyeyle form ve pencere kullanımı.

Yayın örnekleri müsaitlik veya rezervasyon onayı değildir. Bu ortam ortak listeyi keşfetme ve görünürlüğü yönetmeyi gösterir; talep, rezervasyon ve teslim/iade iş akışı henüz yoktur.

Backend regresyon testleri ayrı SQLite ayarını, normal arayüz testleri taklit API yanıtlarını kullanır; demo veritabanını değiştirmez. `test:demo` gerçek yerel demo veritabanında çalışır; senaryolara ait deneme kayıtlarını oluşturup temizler. Komutlar ve sonuç kayıtları: [VERIFICATION.md](VERIFICATION.md). Kullanıcı odaklı anlatım: [KULLANIM_REHBERI.md](KULLANIM_REHBERI.md) ve [görsel rehber](kullanim-rehberi.html).

## Görselleri hazırlama

Demo testleri ve görüntü hazırlama script'leri yeni ekran görüntülerini `var/demo/screenshots/` altında tutar; bu klasör Git tarafından yok sayılır. Özel kaynak envanteri demo ortamına aktarılmış olabilir; görüntüler otomatik olarak herkese açık rehbere yazılmaz. Rehber görsellerini yenilemek için yalnız kurmaca verilerle hazırlanan adayları inceleyip ilgili `docs/images/` veya `frontend/public/guide/images/` dosyasına kopyalayın. Özel envanter değerleri içeren görüntüleri yayımlamayın.
