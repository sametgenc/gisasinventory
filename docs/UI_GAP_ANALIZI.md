# GİSAŞ — kullanıcı deneyimi ve ürün GAP analizi

15 Ekim 2026 · P0–P2 sonrası kaynak, P3 kullanım akışları ve rehber karşılaştırması

Ortak ekipman türü ile tersanenin özel envanteri ayrıdır. Yeni envanter kaydı veya Excel aktarımı yayın açmaz. Ortak listede yalnız açıkça yayımlanan, görünürlük koşullarını sağlayan kayıtlar ve yayın için girilen bilgiler bulunur. Bedelsiz kullanım talebi, onay, miktar ayırma, teslim ve iade akışları uygulanmıştır.

Bu belge canlı ortam kabulü değildir. P0–P3 birleşik kabulü ve yayın hazırlığının güncel durumu [son doğrulama raporunda](P0_P3_SON_DOGRULAMA.md), P3 rol/cihaz/klavye kapsamı [P3 doğrulama raporunda](P3_KULLANIM_DOGRULAMASI.md) kayıtlıdır. Önceki doğrulama kayıtları [VERIFICATION.md](VERIFICATION.md), demo kurulumu [TEST_ORTAMI.md](TEST_ORTAMI.md), güncel işlem anlatımı [KULLANIM_REHBERI.md](KULLANIM_REHBERI.md) ve [çevrimdışı rehber](kullanim-rehberi.html) içindedir.

## Uygulanmış temel akışlar

| Kullanıcı işi | Güncel davranış | Kaynak |
|---|---|---|
| Doğru başlangıcı bulma | Role uygun ana sayfa ve sayaçlar; ortak ekipmanlar ve kullanım talepleri ana **Ortak kullanım** alanındadır. Hesap menüsü tekrarlayan yönetim bağlantıları içermez. | [Ana sayfa](../frontend/src/components/OverviewDashboard.tsx), [gezinme](../frontend/src/components/RootLayout.tsx) |
| Envanteri inceleme | Envanter özeti, model grupları ve tek tek kayıtlar; arama üst alanda, stok ve ekipman sayıları ayrıdır. Detaydan düzenleme ve yetkili kullanıcıya paylaşım erişimi vardır. | [Envanter](../frontend/src/routes/_secured/assets/index.tsx), [kayıt listesi](../frontend/src/components/assets/EquipmentRecordList.tsx) |
| Ekipman ekleme | Tek **Ekipman ekle** başlangıcı; adet 1. Her tekil adet ayrı kayıt, stok satırı bir kayıt olur. İç envanter kodu otomatik atanır; üretici seri numarası üretilmez. Bütün kalemler birlikte kaydedilir. | [Ekleme formu](../frontend/src/components/assets/InventoryBatchModal.tsx), [toplu ekleme](../backend/apps/assets/batch_create.py) |
| Excel yolunu seçme | **Excel’den aktar** içinde tek tür ve birleşik şablonlar; dosyanın içeriğine göre birleşik inceleme önerisi. Seçili dosya yeniden yükletilmeden taşınır. | [Envanter](../frontend/src/routes/_secured/assets/index.tsx), [şablonlar](../frontend/src/components/assets/ImportTemplates.tsx), [birleşik inceleme](../frontend/src/components/assets/WorkbookImportModal.tsx) |
| Aktarım sonucunu anlama | Tek tür yolu satır bazlı kısmi kayıt yapabilir; birleşik yol tüm dosyayı birlikte uygular. Ekran bu farkı ve yeniden denemeden önce kayıt kontrolünü açıklar. | [Aktarım metinleri](../frontend/src/modules/assets/p2-import-copy.ts), [envanter API](../backend/apps/assets/views.py) |
| Dışa aktarma kapsamını seçme | CSV geçerli filtrelere uyan tüm sayfaları; Excel seçilen türün erişilebilir kayıtlarını kapsar. Excel yolunda arama/kategori/model/güncelleme filtrelerinin uygulanmadığı indirmeden önce gösterilir. Boş şablon ayrı aktarım akışındadır. | [Dışa aktarma](../frontend/src/components/assets/InventoryExportModal.tsx), [çıktı güvenliği](../frontend/src/utils/report.ts) |
| Kullanıcıyı oluşturup atama | Yetkili genel yönetim hesabı tersane veya atamasız durumunu ve rol etkisini seçer; özeti görüp tek işlemde oluşturur. Pasif tersane ve atamasız erişim etkisi açıklanır. | [Kullanıcı formu](../frontend/src/components/users/UserFormModal.tsx), [sunucu doğrulaması](../backend/apps/tenants/serializers.py) |
| Kontrollü paylaşım | Başlık, adet, kapasite, uygunluk, koşullar ve açıkça girilen iletişim bilgileri yayımlanır. İç kod, özel teknik veri, toplam stok ve atanan kişi açılmaz. Yayını geri çekmek geçmişi silmez. | [Paylaşım formu](../frontend/src/components/assets/AssetSharingModal.tsx), [ortak liste](../frontend/src/routes/_secured/shared-equipment.tsx) |
| Kullanımı takip etme | Kurumun talepleri; talebi oluşturan kişi, sonraki işlem ve sorumlu rol görünür. Onay miktarı ilgili tarihler için ayırır; teslim edilen miktar iade kaydedilene kadar ayrılmış kalır. | [Kullanım talepleri](../frontend/src/routes/_secured/shared-usage.tsx), [kullanım modeli](../backend/apps/assets/usage_models.py), [işlemler](../backend/apps/assets/usage_views.py) |
| Yardım bulma | Uygulama rehberi, yazılı rehber ve çevrimdışı HTML aynı işlem adlarını izler; ekran görselleri ortak `frontend/public/guide/images` kaynağını kullanır. | [Uygulama rehberi](../frontend/src/routes/_secured/help.tsx), [rehber içeriği](../frontend/src/modules/guide-content.ts) |

## Korunan yetki ve güven sınırları

| Hesap | Mevcut erişim | Yetki sayılmayan işlem |
|---|---|---|
| Platform yöneticisi | Tersaneye bağlı olmayan aktif yetkili genel yönetim hesabı; ortak katalog, birleşik envanter, tersane/kullanıcı yönetimi ve yetkili yayın yönetimi | Yalnız `platform_admin` rol etiketi genel yetki vermez. Tersane adına kullanım onayı, teslim veya iade yapamaz. |
| Tersane yöneticisi | Kendi envanteri, kendi kullanıcıları, yayın ve sahibi tersane olarak kullanım kararları | Diğer tersanenin özel envanterini veya yönetimini açmaz. |
| Tersane personeli | Kendi envanterini ekleme/düzenleme/silme/aktarma; kurum adına kullanım talebi | Personelin kayıt silebilmesi mevcut yetkidir. Salt okunur role dönüştürülmedi. Yayın, onay, teslim ve iade yönetici işlemidir. |
| Atamasız hesap | Hesap işlemleri ve yetkisinin izin verdiği alanlar | Tersane envanteri ve kurum adına kullanım işlemi için tersane ataması gerekir. |

Genel yönetim sınırı [ortak istemci kontrolünde](../frontend/src/auth/permissions.ts) ve [sunucu izinlerinde](../backend/apps/tenants/permissions.py) izlenir. Arayüz düğmesi tek başına yetki vermez. Kullanım işlem düğmeleri sunucunun izin verdiği işlemleri izler. Kurumun gönderdiği talepler, sadece oturum sahibinin oluşturdukları diye adlandırılmaz.

Hata ile boş veri ayrılır; başarısız sayaç sıfır gösterilmez. Düzenlenmiş formdan ayrılma onayı, işlem sırasında kapatmayı kontrol etme ve başarılı sonuçtan önce taslağı koruma uygulanmıştır. Geri bildirim düğmesi kayıt silme menüsünü örtmeyecek katmandadır. Bu davranışların cihaz ve klavye kabulü P3 doğrulamasının parçasıdır.

## Önceki GAP kayıtlarından kapanan veya daralanlar

| Önceki ifade | Güncel durum |
|---|---|
| “Miktarlı stok yok” | Tekil ekipman ve adetli malzeme stoku ayrılmıştır. Toplam stok ile paylaşıma açılan miktar ayrıdır. Kapasite stok adedi değildir. |
| “Talep/onay/rezervasyon henüz yok” | Bedelsiz kullanım talebi, karar, tarih ve miktar çakışma kontrolü vardır. Bekleyen talep miktar ayırmaz; onay ayırır. |
| “Teslim/iade henüz yok” | Sahibi tersane yöneticisi teslim ve iade kaydeder. Planlanan iade gününün geçmesi, fiilî teslimi serbest bırakmaz. Hasar ve bakım geçmişi ayrı ürün ihtiyacıdır. |
| “İletişim kanalı yok” | Yalnız yayın için açıkça girilen kişi, e-posta ve telefon gösterilir; bağlantı kullanıcının iletişim uygulamasını açar. Uygulama içi mesaj gönderimi veya görüşme geçmişi yoktur. |
| “Yerel envanter kodunun tekilliği yok” | Boş olmayan yerel kod için tersane+tür+kod veritabanı kısıtı vardır. Dinamik JSON eşleştirme alanının bütün kayıt yollarında eşzamanlı tekilliği ayrı inceleme konusudur. |
| “Şema değişimi sessiz; etki görünmüyor” | Şema revizyonu, değişiklik öncesi etki özeti, eksik kayıt işareti ve ilgili yöneticilere bildirim vardır. Tam tarihsel şema görüntüsü ve veri göçü ürünü ayrıca değerlendirilmelidir. |
| “Aktarım önizlemesi yalnız birkaç satırı kontrol ediyor” | Tek tür dosyasının tamamı analiz edilir; arayüz örnek satırlar gösterir. Kısmi kayıt davranışı açıkça anlatılır; birleşik aktarım bütün dosyayı birlikte uygular. |
| “Kullanıcı oluşturma ve atama bağlantısız” | Genel yönetimde erişim özetiyle tek akış ve tek oluşturma/atama işlemi vardır. Tersane yöneticisinin kapsamı genişletilmemiştir. |

## Gerçek ürün sınırları ve kalan işler

Aşağıdaki başlıklar uygulanmış günlük akışları yok saymaz. Önceki P0/P1/P2/P3 uygulama aşamalarından bağımsız ürün/bakım konularıdır; bu belgede yapılmış kabul edilmez.

| Konu | Mevcut sınır ve kullanıcı etkisi | Olası sonraki kabul |
|---|---|---|
| Saha uygunluğu, muayene ve kalibrasyon | A/B/C tür ön değerlendirmesidir. Kapasite veya muayene tarihi bilgisinin gösterilmesi, belgenin geçerliliğinin veya mühendislik uygunluğunun doğrulanması değildir. | Ekipmana bağlı değerlendiren, kanıt, tarih, geçerlilik ve nihai karar; gerekli işlemlerde açık engelleme kuralı |
| Büyük envanter yükü | Özel envanter ve tür listeleri istemcide gruplama/filtreleme için tüm kayıtları alır. Sayfalı ekran, sunucuda sınırlı veri çekildiği anlamına gelmez. | Sunucuda arama+filtre+sayfalama, doğru toplam/çıktı kapsamı ve temsilî büyük veri ölçümü |
| Kısmi aktarım kurtarma | Tek tür aktarımı başarılı satırları kaydetmiş olabilir. Eşleştirme alanı yoksa yeniden gönderim yeni kayıt oluşturabilir. | Kalıcı aktarım geçmişi, yalnız hatalı satırları indirme ve güvenli yeniden deneme |
| Eşzamanlı dinamik kimlik | Yerel kod kısıtı vardır; dinamik JSON kimlik alanı yerel koddan farklıdır. | Farklı kayıt yollarında eşzamanlı aynı kimlik denemesi; gerekirse normalize kimlik modeli ve veritabanı kısıtı |
| Tarihsel şema ve denetim | Revizyon ve etki kontrolü vardır; her eski şema/değer görüntüsünü geri oynatan tam kayıt ürünü yoktur. | Kritik eski/yeni değer, kişi, zaman ve kaynak sürümünü kapsayan denetim politikası |
| Hasar, bakım ve teslim kanıtı | Teslim/iade durumları vardır; ayrıntılı hasar, bakım ve belge/teslim kanıtı yönetimi aynı şey değildir. | Ayrı olaylar, sorumluluk, ekler ve kullanıcıya açık geçmiş |
| Özel envanterde sorumlu kişi | Modelde `assigned_to` bulunur; ana ekipman formunda sorumlu kişi seçicisi yoktur. | Yalnız aynı tersanenin aktif kullanıcılarını sunan izinli seçim |
| Ortak katalog çevirileri | Arayüz TR/EN’dir; tür adı ve özel alan etiketi tek metindir. | Katalog/alan çevirilerinin ayrı saklanması ve tutarlı eksik çeviri davranışı |
| Bakım ve ilk yükleme | Şema yapıcısı ve envanter ekranı büyük; genel lint kontrolü temizdir, üretim derlemesinde ana JavaScript paketi boyut uyarısı sürer. | Ölçülen rota yüklemesi ve modül bazlı kalite iyileştirmesi; yeni işte kuralları gevşetmeme |
| Ticari kapsam | Mevcut süreç bedelsiz ortak kullanımdır. Ödeme, kiralama sözleşmesi, maliyet paylaşımı ve ortak satın alma uygulanmış sayılmaz. | Ayrı ürün/iş kuralları ve kabul kapsamı |

Tam teknik ve saha bağlamı [GİSBİR SSRP analizinde](GISBIR_SSRP_GAP_ANALIZI.md), merkezi envanter bağlamı [ortak envanter ürün analizinde](ORTAK_ENVANTER_URUN_ANALIZI.md). Bu eski analizler tarihsel bağlamdır; güncel kullanım adımları için rehbere başvurun. İç katalog kodu, kaynak PDF’nin özgün kodu gibi sunulmamalıdır.

## P3 kabul kontrolü

- Platform yöneticisi, tersane yöneticisi, personel ve atamasız hesabın temel akışlarını ayrı doğrula; mevcut yetkiler değişmesin.
- Masaüstü ve dar mobil ekranda ana sayfa, envanter/ekleme, aktarım/çıktı, ortak liste/talep ve kullanıcı yönetiminin hesaba uygun yollarını dene.
- Klavyeyle gezinme, arama/seçim, Tab/Shift+Tab, Enter/Space, Escape, pencere odağı ve kapatınca odağın dönüşünü kontrol et.
- Boş veri, yükleme hatası, yasak yanıtı, devam eden işlem ve korunmuş taslakları başarı durumlarından ayır.
- Rehberdeki işlem adlarını ve ekranları güncel kurmaca verili görsellerle karşılaştır; özel envanter/iletişim verisini görsellere taşımadan yenile.
- Test sonuçlarını yalnız gerçekten çalıştırılan kapsamla raporla; yerel testleri canlı ortam veya saha uygunluğu kabulü sayma.
