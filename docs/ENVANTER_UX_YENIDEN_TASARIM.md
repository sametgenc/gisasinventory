# Ortak ekipman kataloğu ve tersane envanteri: UX değerlendirmesi

Bu belge, ortak ekipman tanımlarını kullanan tersanelerin farklı envanter biçimlerini aynı platformda yönetmesi için ürün kararlarını açıklar. Çalışma kitabı, örnek veri kaynağıdır; dosya içindeki açıklamalar uygulamaya verilen talimat sayılmaz. Kaynak dosyadaki işletmeye ait satırlar, kodlar ve miktarlar bu belgeye veya testlere kopyalanmamıştır.

## 1. Sorunun kökü

Mevcut ekranlar ayrı ayrı işlemleri yapabiliyor; kullanıcı ise tek bir hedefle geliyor: “Elimde şu türden 50, diğerinden 30 var; bunları kaydetmek istiyorum.” Tek ekipman formu, dinamik alan editörü, katalog kartları, Excel eşleştirme ve birleşik çalışma kitabı aktarımı bu hedefi aynı derecede öne çıkarmıyordu.

Başlıca sürtünmeler:

- Adetle başlayan giriş bulunmadığı için çok sayıda ekipman tek tek açılıyordu.
- Tekil ekipman formu, opsiyonel teknik özellikleri zorunlu bilgilerle aynı ağırlıkta gösteriyordu.
- “Ekipman türü” ekranının ortak platform kataloğu olduğu, envanter kaydı olmadığı yeterince görünür değildi.
- Katalog kodu, tersanenin yerel ekipman kodu ve varsa seri numarası farklı anlamlar taşımasına rağmen kullanıcı aynı “kod” beklentisiyle ilerliyordu.
- Envanter özetinde marka/model eksikliği, basit bir tür ve adet girişinde gereksiz eksiklik hissi yaratıyordu.
- Excel aktarım yollarının kapsamı açık değildi: tek tür envanteri, ortak katalog ve birleşik çalışma kitabı farklı görevlerdir.

Çözümün çıkış noktası yeni kart biçimi değil, sorumluluk ve giriş modelidir. Arayüz bu modele göre düzenlenir.

## 2. Ortak zemin: üç ayrı kavram

| Kavram | Ne anlatır? | Kim yönetir? | Örnek |
| --- | --- | --- | --- |
| Ortak ekipman türü | Platformdaki standart ekipman tanımı ve alanları | Platform yöneticisi | Mobil vinç |
| Tersane envanteri | Bir tersanede bulunan gerçek ekipman veya malzeme kaydı | İlgili tersane | 50 mobil vinç |
| Paylaşım ilanı | Tersanenin paylaşım için yayımladığı miktar ve bilgiler | Tersane yöneticisi | 50 içinden paylaşılabilecek 3 vinç |

Ortak katalogda bir tür bulunması, herhangi bir tersanenin o ekipmana sahip olduğu anlamına gelmez. Envantere eklemek, paylaşım ilanı yayımlamaz. Paylaşımda görünen bilgiler ayrıca seçilir; özel envanter ayrıntıları kendiliğinden açılmaz.

### Katalog kodu

Katalog kodunu platform yöneticisi belirler ve korur. Yeni türde kod boş bırakılırsa sistem benzersiz bir kod atar; yönetici anlamlı bir ortak kod da belirleyebilir. Kodun amacı tersaneler arası ortak tür eşleştirmesidir. Tersane, ekipman eklerken bu kodu üretmez veya değiştirmez; seçtiği ortak türün bağlamında görür. Mevcut kodsuz katalog türleri kullanılabilir; kod olmadığı için envanter kaydı engellenmez.

Kod yapısı kategoriye göre anlamlı olabilir; kullanıcı isimle arayabilmelidir. Kod tür adının önüne geçmez. Örneğin katalog kodu aynı olan tür, iki tersanede aynı ortak tanıma bağlanır; iki tersanenin gerçek ekipmanları yine ayrı kayıtlar kalır.

### Yerel ekipman kodu ve seri numarası

Yerel ekipman kodu tersanenin kendi kayıt düzenidir. Katalog kodundan bağımsızdır. Toplu girişte sistem, kayıtları ayırt etmek için kurum içi envanter kodu atar; kullanıcı bunu sonradan tekil kayıtta değiştirebilir. Kullanıcı sırf formu geçmek için bir kod icat etmez. Gerçek üretici seri numarası otomatik üretilmez; gerçekten ekipmana ait bir özellik olduğunda doldurulur.

Aynı türde 50 ekipmana aynı seri numarası veya aynı tekil tanımlayıcı kopyalanamaz. Toplu giriş, bu alanlar için ekipman başına bir değer olacak şekilde alt alta yapıştırma sunar. Değer sayısı adetle eşleşmeli ve değerler birbirinden farklı olmalıdır. Tekil giriş ve satır bazlı Excel aktarımı diğer yollardır. Kimlik bilgisi ile ortak teknik özellik birbirinden ayrılır.

## 3. Roller ve ekrandaki yetki açıklaması

| İşlem | Platform yöneticisi | Tersane yöneticisi | Tersane kullanıcısı |
| --- | --- | --- | --- |
| Ortak kataloğu görüntüleme | Evet | Evet | Evet |
| Ortak tür/katalog kodu/alan tanımı düzenleme | Evet | Hayır | Hayır |
| Kendi tersane envanterini ekleme ve düzenleme | Hedef tersane seçerek | Evet | Evet |
| Diğer tersanelerin özel envanterine erişme | Yönetim kapsamı içinde | Hayır | Hayır |
| Paylaşım ilanı yönetme | Evet | Evet | Hayır |
| Genel paylaşım ilanlarını keşfetme | Evet | Evet | Evet |

Platform yetkisi yalnızca rol adının “platform_admin” olmasıyla verilmez. Genel yönetim, gerçek yönetici yetkisi ve tersane bağlamı kontrolüyle açılır. Platform yöneticisi envanter eklerken hedef tersane zorunludur. Tersane kullanıcısı için kendi tersanesi otomatik kullanılır; tekrar seçtirilmez.

Katalog ekranındaki açıklama şu soruya doğrudan yanıt verir: “Burada bütün tersanelerin kullandığı ortak tanımlar var; benim elimdeki ekipmanlar nerede?” Envantere geçiş ve bir türü envantere ekleme eylemi görünür olur.

## 4. Alanlar: az zorunluluk, açık anlam

Ortaklaştırma, tüm tersanelerin aynı ayrıntı seviyesinde veri vermesini zorlamak değildir. Platform, alanların anlamını standartlaştırır; kullanıcı bildiği opsiyonel özellikleri doldurur.

- Tür seçimi ve adet, toplu girişin başlangıç bilgileri olur.
- Katalogda zorunlu tanımlanmış alanlar açıkta gösterilir; kayıttan önce doğrulanır.
- Opsiyonel özellikler “Ek özellikler” bölümü altında açılır.
- Boş opsiyonel sayısal alan `0` sayılmaz. “Bilmiyorum” ile “sıfır” farklıdır.
- Boş opsiyonel metin, yanlış bir varsayılanla doldurulmaz.
- Ortak teknik özellikler o giriş satırındaki ekipmanlara uygulanır. 20 tonluk 50 vinç ve 10 tonluk 30 vinç, aynı türde iki giriş satırıdır.
- Mevcut katalogdaki zorunlu alanlar arayüz kolaylığı için yok sayılmaz. Değiştirilmesi gereken alanı platform yöneticisi bilinçli şekilde opsiyonel yapar.
- Zorunlu alan sonradan eklendiğinde eski kayıtlar kaybolmaz; eksik bilgi işareti ve tamamlama yolu gösterilir.

Alan adını değiştirmek, teknik anahtarını değiştirmek değildir. Ortak şema değişikliklerinin kaç kayıt ve tersaneyi etkileyeceği kayıttan önce gösterilir. Görünürde kolay bir alan düzenlemesi, bütün tersanelerin mevcut verisini sessizce yeniden yorumlayamaz.

## 5. Adet ile gerçek kayıt arasındaki ilişki

Sistemde iki takip biçimi vardır:

| Takip biçimi | Bir satır neyi temsil eder? | Adet nasıl hesaplanır? |
| --- | --- | --- |
| Tekil ekipman | Bir fiziksel ekipman | Gerçek ekipman kayıtlarının sayısı |
| Adetle takip edilen stok | Bir malzeme/stok kalemi | O kalemdeki açık stok miktarı |

“50 vinç” toplu girişi, tekil takipte 50 gerçek kayıt oluşturur. Kullanıcı 50 form açmaz; sistem kayıtları tek işlemde oluşturur. Marka/model/kapasite biliniyorsa aynı satırdaki ortak özellikler bu kayıtlara uygulanır. Kullanıcı sonra gerekli ekipmanı tek tek ayrıntılandırabilir.

“500 iskele parçası” stok girişinde 500 tekil ekipman oluşturmaz; bir stok kalemi ve miktarı tutulur. Bu iki takip biçimini karıştırmak, envanter ve paylaşım toplamlarını bozardı. Bir tekil kaydın opsiyonel “quantity” alanına 50 yazılması onu 50 fiziksel ekipmana çeviremez.

Mevcut türün takip biçimi envanter oluşturulduktan sonra arayüzden değiştirilmez. Böyle bir geçiş ayrı veri dönüştürme çalışması gerektirir. Kullanıcı toplu ekleyebilsin diye bütün vinç türleri stok türüne çevrilmez.

## 6. Temel giriş akışları

### Hızlı toplu giriş

1. “Adetle ekipman ekle” açılır.
2. Kullanıcı ortak katalogdan ekipman türünü seçer ve adedini yazar.
3. Zorunlu özellikler varsa tamamlar; opsiyonel özellikleri gerektiğinde açar.
4. “Başka ekipman ekle” ile başka tür veya aynı türün farklı özellik grubu eklenir.
5. Kaydetmeden önce tür/satır ve kayıt sayısını görür.
6. Bütün satırlar tek işlemde doğrulanır. Herhangi bir satır hatalıysa işlem bütünüyle durur; girilen değerler korunur.
7. Başarılı kayıt sonrası envanter yenilenir. Kullanıcı aynı verileri yeniden girmek zorunda kalmaz.

Adet pozitif tam sayı olmalıdır. Toplu girişte yerel kod veya tekil tanımlayıcı N kayda kopyalanmaz. Her ekipman için girilen tanımlayıcı ayrı kayıt satırına çevrilir; eksik, fazla veya tekrar eden değerler açıklamalı hata verir. Tek işlem en fazla 50 giriş satırı ve 500 ayrı ekipman kaydı içerir. Ekipman başına tanımlayıcılar 500 kayıt sınırına kadar ayrı fiziksel kayıtlara açılır. Daha büyük listeler Excel ile aktarılır.

### Tekil ayrıntılı giriş ve düzeltme

Bir ekipmana özgü seri, bakım tarihi, yerel kod gibi bilgiler tekil formda yönetilir. Kullanıcının önceden mevcut bir kaydı düzenlemesi yeni toplu kayıt üretmez. Eksik zorunlu bilgi bildirimi ilgili kayıtları filtreler; düzeltme sonrası kayıt görünür kalır.

### Excel ile giriş

Excel çok sayıda ayrı kimlik, farklı özellik veya mevcut kayıt güncellemesi içerdiğinde kullanılır. Ortak katalogdan tür seçmek, farklı tersanelerin dosya sütunlarını aynı biçimde adlandırmasını gerektirmez. Eşleştirme, dosyanın yerel adlarını ortak alan anlamlarına bağlar.

## 7. Excel biçimleri için kullanım ayrımı

İncelenen çalışma kitabının ilk sayfası açıklayıcı üstveri içerir. `1-TAKSONOMI` sayfasında başlık dahil 176 satır, 9 sütun ve 175 tür tanımı bulunur; A–M arası 13 kategori vardır. Tekrarlanan kategori değerleri, tür satırlarını ortak sınıfta toplar. Bunlar gerçek tersane stok miktarları veya fiziksel ekipman seri numaraları değildir.

Katalog/taksonomi dosyası ile gerçek tersane envanteri aynı görev değildir. Taksonomide ekipman adları, sınıflar, özellik açıklamaları ve paylaşım değerlendirmesi bulunabilir; bu satırlar gerçek stok miktarı sayılmaz. Envanterde ise tersane, yerel kod, özellikler ve gerçek miktarlar bulunabilir. Bu yüzden dosyayı doğrudan “tersanede 175 ekipman var” sonucuna çevirmek yanlıştır.

| Aktarım yolu | Kullanım | Kullanıcıdan beklenen |
| --- | --- | --- |
| Ortak katalog aktarımı | Platform türlerini oluşturma/güncelleme | Platform yetkisi, katalog değişikliklerinin gözden geçirilmesi |
| Tek tür envanter Excel'i | Bir ekipman türünde satır bazlı kayıtlar | Tür seçimi, sütun eşleştirme, dosya önizlemesi |
| Birleşik çalışma kitabı | Desteklenen katalog/alan/envanter sayfalarını birlikte işleme | Önizleme, hedef tersane, belirsiz kararların çözülmesi |

Farklı başlık satırları, sayfa adları, boş satırlar, açıklama satırları ve yerel sütun adları beklenir. Önizleme bu düzeni görmeyi ve desteklenen eşleştirmeleri seçmeyi sağlar. Arayüz “her Excel biçimi otomatik ve hatasız aktarılır” vaadi vermez.

Belirsiz paylaşım sınıfları kullanıcı kararına sunulur; tahminle kesinleştirilmez. İçe aktarma önizlemesi ile uygulama aynı gözden geçirilmiş veriye bağlıdır. Dosya veya karar değişmişse önizleme yeniden alınır. Kaynak dosyanın satır numarası ve hatanın açıklaması kullanıcıya gösterilir.

## 8. Envanter ekranının bilgi sırası

Ekran önce tersane kapsamını ve envanter toplamını gösterir. Birincil eylem envanter eklemektir. Excel ve dışa aktarma bu eylemin yanında ikincil araçlar olarak kalır. Teknik katalog yönetimi tersanenin gündelik kayıt işinin içine sokulmaz.

Özet görünümde ekipman adı ve adet öne çıkar. Marka/model girilmişse alt bilgi olur; boşsa işlem eksikmiş izlenimi yaratmaz. Stok kaleminde malzeme adı, yerel kod ve gerçek miktar görünür. Kayıt listesinde ayrıntı, düzenleme, silme ve yetkili kullanıcılar için paylaşım yönetimi bulunur.

Arama tür adı, marka/model, yerel ekipman kodu ve desteklenen alan değerleriyle çalışır. Platform görünümünde tersane filtresi vardır. Filtrelenmiş miktar, bütün envanter miktarı gibi sunulmaz. Stok miktarı ile fiziksel ekipman sayısı ayrı anlamlarıyla gösterilir.

## 9. Mobil ve erişilebilirlik kararları

- 320 piksel genişlikte yatay sayfa taşması oluşmaz; giriş satırları tek sütuna iner.
- Tür, adet ve temel eylemler telefonda erişilebilir kalır.
- Açılır özellik bölümleri gerçek etiket ve klavye erişimi kullanır.
- Diyalog başlığı ekran okuyucuya bağlıdır. Odak diyalog içinde kalır, Escape ile kapanır ve açan denetime döner.
- Kayıt sırasında tekrar gönderim ve yanlışlıkla kapatma engellenir.
- Hata yalnız renk ile anlatılmaz; metin ve ilgili alan/satır bağlamı bulunur.
- Sayısal alanlar uygun mobil klavyeyi açar; adet kesirli veya negatif kabul edilmez.
- Türkçe ve İngilizce metinler aynı görev ayrımını korur.

## 10. Gerçek kabul ölçütleri

1. Kullanıcı iki satırda 50 ve 30 tekil ekipman ekler; tek kayıt isteği ve toplam 80 gerçek kayıt oluşur.
2. Boş satır veya sıfır/negatif/kesirli adet kaydedilemez.
3. Opsiyonel özellikler kapalı başlar; boş değerler miktar veya teknik bilgi uydurmaz.
4. Zorunlu alanlar kaydetmeden önce görünür ve doğrulanır.
5. Tekil tanımlayıcı birden çok fiziksel kayda kopyalanamaz; neden ve alternatif yol görünürdür.
6. Bir satırdaki sunucu hatası bütün toplu işlemi geri alır; modal satırları ve miktarları korur.
7. Platform yöneticisi hedef tersane seçmeden envanter oluşturamaz; tersane kullanıcısı başka tersaneyi seçemez.
8. Katalog kodu tür bağlamında görülür; yerel ekipman kodu alanıyla karışmaz.
9. Stok miktarı tekil kayıt sayısı olarak, tekil kayıttaki rastgele miktar alanı ekipman toplamı olarak hesaplanmaz.
10. Yeni envanter özel kalır; paylaşım ancak ayrı yönetim eylemiyle açılır.
11. 320, 390 ve masaüstü genişliklerde form ve özetler kullanılabilir kalır.
12. Mevcut arama, filtre, sayfalama, zorunlu alan bildirimi ve gözden geçirilmiş Excel aktarım güvenceleri korunur.

## 11. Kapsam ve sonraki ürün kararları

Bu çalışma katalog ve envanter görevlerini ayırır, adetle hızlı giriş getirir ve opsiyonel alanların görünürlüğünü azaltır. Eski katalogdaki yanlış alan zorunluluğunu kendiliğinden silmez, mevcut envanteri temizlemez ve bütün tersanelerin kaynak dosyalarını otomatik ortak formata çevirmiş saymaz.

Tür önerisi/onay akışı, tersaneye özel ek alanlar, birim dönüşümü, gelişmiş dosya şablonu hafızası ve takip biçimi dönüştürme ayrı kapsamdır. İhtiyaç kanıtlandığında ortak katalog yönetişimiyle tasarlanmalıdır. Gerçek üretici seri numarası üretilmez; yerel ekipman kodunu otomatik atamak farklı bir iştir.

Başarı ölçütü yeni alan sayısı veya kart görünümü değil, tersane kullanıcısının bildiği tür ve miktarı az adımda, doğru kayıt anlamıyla sisteme ekleyebilmesidir.

## 12. Uygulama ve doğrulama

Katalog, envanter özeti, adetle giriş ve tek kayıt formu güncellendi. Kod sahipliği ekranda açıklanır; ortak katalogdan seçilen tür doğrudan adetle girişe taşınır. Zorunlu alanlar açık, opsiyonel özellikler açılır bölümde gösterilir. Stok miktarı ve fiziksel ekipman sayısı ayrı kalır.

Toplu kayıt tek veritabanı işlemi içinde uygulanır. Hatalı satır tüm işlemi geri alır. İşlem kimliği kalıcı tutulduğu için ekipman kodları sonradan değiştirilse veya ekipman silinse bile aynı işlemi yeniden göndermek kopya üretmez. Benzersiz kimlik kontrolleri tersane ve tür kapsamında tek kez yüklenen indeks kullanır; denetim kayıtları korunur.

- 61 ilgili arayüz testi geçti; 320/390 piksel mobil görünüm, katalog sahipliği, adetli giriş, Excel önizlemesi, arama ve sayfalama kapsandı.
- 68 hedefli arka uç testi geçti; SQLite üzerinde PostgreSQL kilit davranışına özel bir test atlandı.
- Gerçek yerel sunucuda 50 vinç ve 30 jeneratör tek işlemde eklendi. 80 özel kayıt, doğru tersane, tekrar gönderim engeli ve tek ekipmanı düzenleme doğrulandı. Kurmaca test kayıtları temizlendi; önceki envanter korundu.
- Tip kontrolü, değişen arayüz dosyalarında lint ve üretim derlemesi geçti. Bağımsız Python, TypeScript ve bütünleştirme incelemelerinde bulunan sorunlar giderildi.

Tüm depo lint denetiminde bu çalışmanın dışındaki mevcut hatalar bulunuyor. Daha geniş arka uç paketindeki mevcut bir gizlilik testi, rastgele katalog kodunda `50` dizisi geçtiğinde yanlış alarm üretiyor; bu sonuç hedefli doğrulamanın dışında tutuldu. PostgreSQL eşzamanlılık testleri gerçek PostgreSQL üzerinde ayrıca çalıştırılmalı.

Yeni `assets/0008_batch_operation` migration’ı kalıcı işlem kimliklerini saklar. Yerel demoya uygulandı; mevcut kurulumun dağıtımında da migration çalıştırılmalıdır.
