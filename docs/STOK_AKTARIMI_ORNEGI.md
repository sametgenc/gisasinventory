# Kurmaca örnekle adetli stok aktarımı

14 Ekim 2026 · Bu belgedeki kodlar, miktarlar ve malzeme örnekleri kurmacadır; gerçek envanterden alınmamıştır. Kullanıcının özel kaynak dosyasına ait kabul ayrıntıları yerel özel notlarda tutulur; kaynak dosya değiştirilmez.

Kurmaca örnekte **3 malzeme kalemi, toplam 750 parça** bulunur:

| Malzeme kodu | Kurmaca malzeme adı | Stok adedi |
|---|---|---:|
| `ORNEK-STOK-01` | Örnek yürüme platformu | 500 |
| `ORNEK-STOK-02` | Örnek bariyer | 250 |
| `ORNEK-STOK-03` | Örnek diyagonal eleman | 0 |

Her satırın malzeme kodu farklıdır. Sıfır, eksik bilgi değildir; stok satırı korunur.

## Uygulamada nasıl görünür?

İskele malzemeleri **Adetli malzeme stoku** takip biçimindedir. Özet satırları malzeme adını, yerel kodunu ve stok adedini gösterir; satır doğrudan ayrıntıya açılır. Parça adedi kadar ayrı ekipman kaydı oluşturulmaz. Merkez ekranında sahip tersane de görünür. Başka tersanenin aynı kodu aynı malzeme sayılmaz; kayıtlar otomatik birleştirilmez.

Forklift gibi tek tek izlenen ekipmanlar kendi takip biçiminde kalır: aynı marka/modelin kayıtları birlikte sayılır; açılınca her ekipman ayrı görünür.

## Excel eşlemesi

Bu kurmaca dosya düzeninde başlık **1. satır**, ilk kayıt **2. satır** kabul edilir. Kendi dosyanızda başlığın yerini önizlemeden kontrol edin. Sistem şablonuyla karıştırmayın: şablonda ilk üç satır açıklamadır, veri 4. satırda başlar. Dış dosya için **Ham Excel** kullanın.

| Kaynak sütun | Uygulama alanı | Anlam |
|---|---|---|
| Seri Numarası | Malzeme kodu (`material_code`) | Yerel stok kalemi kodu; ayrı parçaların seri numarası değil |
| İsim | Malzeme adı (`material_name`) | Ölçüleriyle birlikte malzemenin adı |
| Adet | Stok adedi (`quantity`) | Sıfır veya pozitif tam sayı |
| ID | Kaynak kayıt kimliği (`source_record_id`) | Export'un kısa kimliği; uygulamanın UUID'si değil |
| Oluşturulma Tarihi | Kaynak kayıt tarihi (`source_created_at`) | Kaynak tarih metni; sistem oluşturulma tarihini değiştirmez |
| Tersane | Kaynak tersane (`original_shipyard`) | Kaynak bilgisi; sahiplik yerine geçmez |

İlk üç alan stok türünde hazır gelir. Kaynak bilgilerini de saklamak için türde son üç metin alanı tanımlanabilir. Aktarımda hedef tersane ayrıca seçilir; normal tersane kullanıcısında kendi tersanesi kullanılır.

Aynı tersane, tür ve malzeme koduyla tekrar aktarım mevcut adedi **yenisiyle değiştirir**; eski adedin üzerine eklemez. Yeni kayıtlar paylaşıma kapalıdır. Ham Excel aktarımı satır bazındadır: hatalı satırlar olsa da başarılı satırlar kaydedilebilir. Sonuçları kontrol etmeden tüm dosyayı yeniden göndermeyin.

## Kurmaca çalışma dosyaları

İki yerel alıştırma dosyası aynı kurmaca stok satırlarını içerir:

- `var/demo/samples/Stok_ornek_aktarim.xlsx`, uygulamanın **Ham Excel** aktarım ekranı içindir. **Stok** sayfası yukarıdaki tabloyu, **Aktarım bilgisi** sayfası sütun eşlemelerini gösterir. Başlık satırı 1'dir.
- `var/demo/samples/Stok_ornek_export.xlsx`, yerel demo hazırlama komutu içindir. Yalnız **Stok** sayfası vardır; `Seri Numarası`, `İsim`, `Adet`, `ID`, `Oluşturulma Tarihi` ve `Tersane` export başlıklarını kullanır. Komut tek sayfalı dosya bekler; açıklama sayfalı aktarım dosyasını kabul etmez.

Bu alıştırma varsayılan demo başlangıç verisine otomatik eklenmez. Demo kurulumunu yapan kişi tek sayfalı export dosyasını açıkça seçerek hazırlayabilir:

```bash
cd backend
.venv/bin/python manage.py seed_stock_sample --settings=config.demo_settings --file '../var/demo/samples/Stok_ornek_export.xlsx'
```

Yerel demo platform hesabıyla **Birleşik envanter → Tersane: Örnek Stok Tersanesi** seçin. Bu kurmaca dosyayla 3 özel stok kalemi, toplam 750 parça görünür. Yeni stok kayıtları ortak listede yayımlanmaz.

## İsteğe bağlı özel kaynak dosya kabulü

Gerçek bir export ile kabul denemesi yapılacaksa kullanıcı dosyayı ayrıca ve özel olarak sağlar. Kaynak dosya, dönüştürülmüş aktarım kopyaları ve kaynak değerlerini içeren kabul notları herkese açık proje dosyalarına eklenmez. Yerel özel notların ve önceki analizlerin yeri `var/demo/private-source-notes/` altındadır; bu klasör Git tarafından yok sayılır. Kurmaca alıştırma ile özel kaynak kabulü farklı veri setleridir.

Yerel demo platform hesabıyla **Birleşik envanter → Tersane** filtresinden kabul denemesi için hazırlanan kurumu seçin. Stok satırları yalnız izole test veritabanına eklenir, ortak listede yayımlanmaz. Kurulum yapan kişi açıkça sağlanan özel dosyayı şöyle okuyabilir:

```bash
cd backend
.venv/bin/python manage.py seed_stock_sample --settings=config.demo_settings --file '/path/to/private-source.xlsx' --tenant-slug '<private-local-slug>'
```

Komut kaynak dosyayı yalnız okur. Üretim ayarında çalışmaz; dosyanın bütün satırlarını işlem öncesi doğrular. Yeniden çalıştırıldığında mevcut örnek kayıtları, elle yapılan düzenlemeleri ve paylaşım kararlarını korur. Güncel adedin yeniden alınması için uygulamanın Excel güncelleme akışı kullanılır.

Önceden hazırlanmış özel yerel veriyi aynı kurum altında sürdürmek için kurulumun mevcut özel slug değerini `--tenant-slug` ile verin. Değeri kendi yerel kabul notlarınızdan alın; yeni kabul için farklı bir slug seçin. `--tenant-name` verilmediğinde mevcut kurumun adı korunur. Kurmaca örnekle aynı kurum altında hazırlamayın. Mevcut yerel veritabanı kayıtları bu belge örnekleri nedeniyle değiştirilmez.

## Açık GAP'ler

- **Adedin anlamı:** toplam stok ile diğer tersanelere verilebilecek miktar ayrı kavramlardır. Bu örnekte miktar stok olarak gösterilir; müsait veya paylaşılabilir miktar olduğu iddia edilmez.
- **Ortak malzeme sözlüğü:** farklı tersanelerin yerel kodlarını ve adlarını tek ortak malzeme tanımına bağlamak gerekir. Ad benzerliği veya eşit yerel kod güvenilir eşleme değildir.
- **Kimlik garantisi:** Excel kod eşlemesi var; elle veya eşzamanlı oluşturmayı engelleyen veritabanı tekillik kısıtı henüz yok.
- **Tam dosya kabulü:** genel envanter import'unda bütün dosya için oluştur/güncelle/hata planı ve atomik kabul henüz yok; demo hazırlama komutunun bütün dosya kontrolü bu genel özelliğin yerine geçmez.
- **Stok hareketi ve birim:** giriş/çıkış, teslim/iade, metre/m²/kg gibi kesirli birimler ve paylaşılabilir miktar ayrı ihtiyaçlar.
- **Ortak listenin stok anlatımı:** özel malzeme adı/kodu/miktarı otomatik yayımlanmaz. Yapılandırılmış ortak malzeme başlığı ve paylaşılabilir miktar eklenene kadar sahibi tersane açık paylaşım notunu kullanır.
