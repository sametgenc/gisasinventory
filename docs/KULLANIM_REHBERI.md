# GİSAŞ · Hızlı kullanım rehberi

Tersanenizin envanterini tek yerde görün. Forklift gibi tek tek izlenen ekipmanlar marka/model ve toplam adetle gösterilir; **Listeyi aç** ile ayrı kayıtlarına ulaşılır. İskele parçaları gibi adetle tutulan malzemeler **malzeme adı, kodu ve stok adedi** ile gösterilir. Kurmaca örnekte bir stok satırında 500 adet bulunabilir; 500 ayrı kayıt açılmaz. Diğer tersanelere göstereceğiniz kayıtları ayrıca seçersiniz.

Adım adım ekranlarla anlatım: **[Resimli kullanım rehberini aç](kullanim-rehberi.html)**. Uygulamaya giriş yaptıktan sonra menüdeki **Kullanım rehberi** bağlantısından aynı işlemleri takip edebilirsiniz. Doğrudan bir rehber bağlantısı açarsanız önce giriş istenir; ardından seçtiğiniz adıma dönersiniz.

## 1. Envanterimi incele

1. **Envanterim** ekranında marka, model ve toplam adedi görün; ilgili grubun **Listeyi aç** düğmesine basın.
2. Açılan listede her satır bir ekipmandır. Ekipmanı açarak bütün bilgilerini görün; düzenleme veya paylaşım için o satırdaki **İşlemler** menüsünü kullanın.
3. Başka model için **Özete dön**; tüm kayıtlar için **Tek tek ekipmanlar** seçin.

Uzun listelerde alttaki sayfa numaraları veya **Önceki / Sonraki** düğmeleriyle ilerleyin. **Sayfa başına** gösterilen satır sayısını değiştirir; modelin toplam adedini değiştirmez. Arama veya filtre değişince ilk sayfa açılır.

**Sonuç:** Önce modelin adedini, sonra o modeldeki ekipmanları tek tek görürsünüz. Adet, mevcut kayıtların sayısıdır; tek bir kayda 50 yazarak 50 ekipman oluşturulmaz. Modeli boş kayıtlar **Model belirtilmemiş** altında görünür. Diğer tersanelerin seçilmiş yayınları **Ortak ekipmanlar** ekranındadır. Platform hesabında kurum kayıtları **Birleşik envanter** altında, sahiplikleri korunarak toplanır.

[Ekran ve ayrıntılı adımlar](kullanim-rehberi.html#envanter)

## 2. Ekipman ekle

1. **Envanterim → Ekipman ekle** seçin.
2. Türü, marka ve modeli, ekipman kodunu ve zorunlu bilgileri doldurun. Platform hesabında sahibi aktif tersaneyi de seçin.
3. **Oluştur** seçip kayıt kartını kontrol edin. Sonraki düzenlemelerde **Kaydet** kullanın.

**Sonuç:** Fiziksel ekipman envanterinize eklenir; diğer tersanelere otomatik açılmaz. Tür yoksa platform yöneticisinden ortak tanım isteyin. Aynı ekipman kodunu farklı fiziksel ekipmanlarda kullanmayın.

[Form ve örnek bilgiler](kullanim-rehberi.html#ekle)

## 3. Excel'den aktar

1. **Envanterim → Diğer İşlemler → Excel'e Dışa Aktar** açın; türü seçip **Şablonu İndir** kullanın.
2. Gerçek ekipmanları **4. satırdan itibaren** yazın. İlk üç satırı, başlıkları ve gizli `_mapping` sayfasını koruyun.
3. **Excel'den İçe Aktar** açın; dosyayı seçip **Önizle ve Devam Et** kullanın. **Dosyayı inceledik** bölümünde önerilen Excel sayfasını, başlık satırını, ekipman türünü ve sütun eşleşmelerini kontrol edin.
4. Hazır, atlanan ve kontrol bekleyen satırları inceleyin. Güvenle ayırt edilen toplam/ara toplam, tekrarlanan sütun başlıkları ve bölüm başlıkları aktarılmaz; hangi Excel satırının neden atlandığı gösterilir. Belirsiz alanları düzeltin. Sorunlu satırları Excel’de düzeltip yeniden yükleyin veya tamamını bu aktarımda hariç tutmayı açıkça seçin.
5. Tür, sütun veya dosya düzenini değiştirdiyseniz **Dosyayı yeniden kontrol et** kullanın. Hedef tersaneyi doğrulayın; **hazır kaydı aktar** düğmesiyle işlemi tamamlayın.
6. **Oluşturuldu, Güncellendi, Atlandı, Hata** sonuçlarını inceleyin; envanterde birkaç kaydı doğrulayın.

**Sonuç:** Geçerli ekipman satırları eklenir veya eşleşen kayıtlar güncellenir. Aktarım paylaşımı açmaz. Hata varsa başarılı satırlar kaydedilmiş olabilir; dosyayı tekrar göndermeden sonuçları kontrol edin. Benzersiz anahtar olmayan türlerde tekrar aktarım yeni kayıt oluşturabilir.

[Önizleme ve eşleşme kuralları](kullanim-rehberi.html#excel)

### Adetli malzeme dosyasını aktar

1. Platform yöneticisi **Ekipman türleri → Tür ekle** ekranında **Adetli malzeme stoku** takip biçimini seçer. Malzeme kodu, malzeme adı ve stok adedi alanları hazır gelir.
2. Envanterde **Excel'den İçe Aktar** açılır; dosya seçilip önizlenir. Başlık ve Excel sayfası otomatik önerilir. Birden fazla sayfa uygunsa **Dosya düzeni** bölümünden seçim yapılır.
3. Kaynak sütunları önerilir: **Seri Numarası → Malzeme kodu**, **İsim → Malzeme adı**, **Adet → Stok adedi**. Önerileri kontrol edin; eksik zorunlu eşleştirmeleri tamamlayın. Dosyadaki “Seri Numarası” burada ayrı parçaların seri numarası değildir.
4. Doğru tersane ve stok türü seçilir; önizlemede ilk iki kayıt ve sıfır adetli kalem kontrol edilir. Aktarım sonucu kalem sayısı ile parça toplamı ayrı görünür.

**Kurmaca örnek:** **3 stok kalemi, 750 parça** vardır: `ORNEK-STOK-01` yürüme platformu 500 adet, `ORNEK-STOK-02` bariyer 250 adet, `ORNEK-STOK-03` diyagonal eleman 0 adet. “Örnek yürüme platformu · 500 adet” tek stok kaydıdır; **Ayrıntıyı aç** ile kodunu ve bilgilerini görürsünüz. Sıfır adetli kalem silinmez. Bu değerler gerçek envanterden alınmamıştır. Kaynak ID ve tarih ek bilgi olarak saklanabilir; uygulamanın kayıt kimliği veya oluşturulma tarihi yerine geçirilmez. Toplam stok, paylaşıma verilebilecek miktar değildir.

Formüller, Excel hücre hataları, yinelenen ekipman kodları ve eksik/geçersiz değerler kontrol bekleyen satırlarda görünür. Aynı modeldeki farklı ekipman kodları normal kayıtlardır. Birden fazla ekipman türü aynı sayfadaysa türleri ayrı Excel sayfalarına veya dosyalara ayırın. Sıfır adet ve adında “toplam” geçen gerçek malzemeler korunur; belirsiz değerler tahminen değiştirilmez. Dosyadaki tersane sütunu sahiplik atamaz.

Tek tek ekipman türünü stok türüne çevirmek mevcut kayıtların anlamını değiştirir. Kayıt içeren türlerde takip biçimi değiştirilemez; ayrı bir stok türü açılır.

## 4. Ortak listeye aç veya geri çek

1. İlgili modelde **Listeyi aç** seçin. Ekipmanı kodundan bulun; **İşlemler → Paylaşımı yönet** açın.
2. **Bu ekipmanı diğer tersanelerin ortak listesinde göster** seçeneğini işaretleyin.
3. **Ortak listede görünen ad** yazın; karşı tersane malzemenin veya ekipmanın ne olduğunu anlayabilsin. Kapasiteyi ve kullanım/taşıma/teslim koşullarını yalnız paylaşmak istediğiniz bilgilerle doldurun.
4. Paylaşım adedini ayrıca belirleyin. **Kurmaca örnek:** envanterde 500 platform parçası bulunabilir; yalnız 100 adedini paylaşıma açabilirsiniz. Toplam stok otomatik yayımlanmaz. Tek tek izlenen bir ekipman kaydı için adet 1 olur; aynı modelin 50 kaydı ayrı ekipmanlardır. Adet belirtilmiyorsa diğer tersane sizinle görüşür.
5. Uygunluğu belirtin; gerekiyorsa tarih veya çalışma koşulunu not edin. İsteğe bağlı iletişim bölümüne diğer tersanelere açık olmasını istediğiniz kişi, e-posta veya telefon yazın. Hesabınızın ve tersanenizin kayıtlı iletişim bilgileri otomatik kopyalanmaz.
6. Karşı tersanenin göreceği önizlemeyi kontrol edip **Kaydet** seçin. **Ortak ekipmanlar → Detayları gör** ile yayınınızı kontrol edin. Geri çekmek için görünürlük işaretini kaldırıp **Ortak listeden kaldır** seçin; kaydedilmiş bilgiler taslak olarak kalır.

**Sonuç:** Başlık, tür, sahibi tersane, belirttiğiniz paylaşım adedi, kapasite, uygunluk, koşullar ve açıkça girdiğiniz iletişim bilgileri ortak listede görünür. İç ekipman kodu, özel teknik alanlar, toplam stok ve atanan kişi açılmaz. Ekipman kurum envanterinde kalır.

Bu işlem tersane yöneticisi veya yetkili platform hesabına aittir. Personel envanterini yönetebilir; yayın ayarını değiştiremez. Uygunluk tersanenin beyanıdır; talep veya rezervasyon onayı değildir. Kullanım, taşıma ve tarih için sahibiyle teyitleşin. K kategorisi, C ön sınıfı veya kapsam dışı nedeni olan türler yayınlanamaz.

**Stok azalırsa:** normal düzenleme veya Excel aktarımında toplam stok, paylaşıma açılan adedin altına düşerse yayın durur; detaylar taslak olarak saklanır. Stok yeniden artsa da otomatik yayımlanmaz. Adedi düzeltip yeniden yayınlayın. Ekipmanın türü değiştirilince de yayın durur. Sahibi tersane değişirse bütün paylaşım bilgileri temizlenir; yeni sahibi karar verir.

[Paylaşım penceresi ve örnek yayın](kullanim-rehberi.html#paylas)

## 5. Tür kataloğunu düzenle · Platform yöneticisi

1. **Ekipman türleri** ekranında mevcut tanımı arayın. Tek tanım için **Tür ekle** kullanın; ortak ad, katalog kodu, kategori, ön sınıf ve ekipman bilgi alanlarını hazırlayın.
2. Toplu işlem için **Katalogdan aktar → Excel şablonunu indir** seçin. **Katalog** sayfasında ikinci satırdan itibaren her türü bir satıra yazın.
3. Dosyayı ve modu seçip **Dosyayı önizle** kullanın. **Yalnızca yeni tipleri ekle** mevcut kodları korur; **Katalog koduna göre güncelle** eşleşen tanımı değiştirir.
4. Hataları düzeltip **… değişikliği aktar** ile onaylayın.

**Sonuç:** Ortak türler oluşur veya güncellenir; fiziksel ekipman eklenmez. Hatalı katalogda hiçbir kayıt aktarılmaz. Güncellemede boş açıklama veya kapsam dışı nedeni mevcut değeri temizler. A/B/C türün ön değerlendirmesidir; ekipmanın anlık uygunluğunu göstermez.

[Katalog önizlemesi ve dosya kuralları](kullanim-rehberi.html#katalog)

Takıldığınız adımlar için [soru ve yanıtlar](kullanim-rehberi.html#yardim). Kurmaca hesaplar ve örnek Excel dosyaları için [demo eki](kullanim-rehberi.html#demo). Ortamı hazırlayan kişi için [test ortamı notları](TEST_ORTAMI.md).

14 Ekim 2026 · Görsel rehber çevrimdışı kullanılabilir; görseller için yanındaki `images` klasörünü koruyun.
