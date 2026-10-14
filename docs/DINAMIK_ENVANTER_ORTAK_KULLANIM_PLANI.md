# Ortak katalog, tersane envanteri ve bedelsiz kullanım

Durum: Uygulandı. Güncel test sonuçları [VERIFICATION.md](VERIFICATION.md), kullanıcı adımları [KULLANIM_REHBERI.md](KULLANIM_REHBERI.md), canlı güncelleme [CANLI_GUNCELLEME.md](CANLI_GUNCELLEME.md) içinde.

## Ürün modeli

Ekipman türü, bütün tersanelerin kullanabildiği ortak tanımdır: örneğin forklift. Katalog kodu bu tanımı kalıcı olarak tanımlar. A–M taksonomi harfleri kategori kodudur; ekipmanın katalog numarası değildir.

Envanter kaydı belirli bir tersaneye aittir. Yerel envanter kodu, ortak katalog kodundan ayrıdır; farklı tersaneler aynı yerel kodu kullanabilir. Tekil ekipmanlar ayrı kaydedilir. Adetli malzemede tek kayıt, belirtilen toplam adedi temsil eder. Bilinmeyen adet sıfır sayılmaz.

Paylaşım, tersanenin açıkça yayımladığı bilgi ve adetle sınırlıdır. İç stok, seri numarası, zimmet ve diğer özel alanlar ortak listeye taşınmaz. Kullanım bedelsizdir. Talebi ekipmanın sahibi tersanenin aktif yöneticisi onaylar.

## 1. Dinamik alanlar

- Yeni alanlar isteğe bağlı başlar. Ad, tarih, sayı, seçenek, e-posta ve benzeri alanlar yönetici tarafından seçilir.
- Stok takibi sabit üç alanı zorunlu kılmaz. Kod, görünen ad ve adet için kullanılacak alanlar seçilebilir.
- Mevcut alanın görünen adı değişince veri anahtarı değişmez; eski kayıtlar korunur.
- Zorunlu alan değişikliğinde etkilenecek kayıt ve tersane sayısı kaydetmeden önce gösterilir.
- Eksik kayıtlar “Güncelleme gerekli” olarak görünür. Her etkilenen tersane yöneticisine sürüm başına toplu bildirim gider.
- Eksik zorunlu alanlar tamamlanmadan yeni paylaşım ve kullanım onayı yapılamaz. Devam eden kullanımın iadesi engellenmez.

## 2. Tek Excel ile aktarım

Tek dosyada üç sayfa kullanılabilir: **Ekipman türleri**, **Alanlar**, **Envanter**. Katalog kodu sayfaları bağlar. Envanterin hedef tersanesi ekrandan seçilir; dosyadaki rastgele bir tersane adı sahipliği belirlemez.

Platform yöneticisi ortak tür ve alanları oluşturabilir. Tersane yöneticisi mevcut türlerle kendi envanterini aktarabilir. Dosya önce incelenir; oluşturulacak ve güncellenecek kayıtlar, atlanan toplam satırları ve düzeltilecek hatalar gösterilir. Onaylanan dosyanın tamamı birlikte uygulanır; değişmiş önizleme yeniden incelenir. Aktarım kayıtları kendiliğinden paylaşıma açmaz.

GISBIR dosyası 13 kategori ve 175 ekipman türü içerir. Gerçek tersane, stok adedi ve seri numarası içermez; bu dosya tek başına envanter oluşturmaz. Ana taksonomi sayfası kullanılır; tekrar eden kategori sayfaları ikinci kez aktarılmaz. İki B/C sınıfı kullanıcı kararı gerektirir. Teknik kapasite birimi stok adedi yerine kullanılmaz. Saha uygunluğu ayrıca değerlendirilir.

## 3. Bedelsiz ortak kullanım

Akış: **Talep gönder → sahibi onaylasın → teslim et → iadeyi al**. Ret ve teslim öncesi iptal ayrıca izlenir.

- Talepte tarih aralığı, adet ve kullanım amacı bulunur; ücret alanı bulunmaz.
- Bekleyen talep stok ayırmaz. Onaylanan ve teslim edilmiş talepler kullanılabilir adetten düşülür.
- Çakışan tarih aralıklarında aynı ekipman iki kez fazla miktarda onaylanamaz. İade edilmeyen ekipman tarih geçse de ayrılmış kalır.
- Açık talebi olan kaydın tersanesi veya türü değiştirilemez, kayıt silinemez. Ayrılan miktarın altına stok veya paylaşım adedi düşürülemez.
- Talep ve durum bilgilerini yalnızca ilgili iki tersane görür. Platform yöneticisi tersane adına onay vermez.
- Durum değişiklikleri bildirim ve mevcut güvenli e-posta kuyruğuyla iletilir; testte gerçek SMTP kullanılmaz.

## 4. Doğrulama ve yayın

Dinamik alanlar, eski kayıtların korunması, Excel önizleme tutarlılığı, yetki sınırları, miktar çakışmaları, tekrar edilen onaylar ve teslim/iade akışı test edilir. Arayüz masaüstü ve dar ekranda kontrol edilir. Yeni veritabanı geçişleri eklenir; eski geçişler değiştirilmez. Canlı veritabanında tek geçiş işlemi çalıştırılır. Canlı dağıtımı kullanıcı yapar.

Tersaneler arası paylaşım mevcut güvenlik anahtarı `CROSS_TENANT_SHARING_ENABLED` ile açılır. Varsayılan kapalı durumu korunur; etkinleştirme canlı ortam yapılandırmasının açık kararıdır.
