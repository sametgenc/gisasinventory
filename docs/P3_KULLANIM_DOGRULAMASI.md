# P3 kullanım doğrulaması ve sonuç raporu

15 Ekim 2026

P3 kapsamında temel kullanıcı işleri masaüstü, mobil görünüm ve klavyeyle doğrulandı. Mevcut rol, tersane, yayın ve özel veri sınırları korundu. Bu aşamada sunucu kaynaklarında veya veri şemasında değişiklik yapılmadı; P3 öncesi sunucu kaynak yedeğiyle karşılaştırma da bunu doğruladı. Canlıya yayın yapılmadı.

## Yetkiye göre doğrulanan akışlar

| Hesap | Gerçek sunucuda denenmiş temel iş | Masaüstü | Mobil | Klavye |
|---|---|---|---|---|
| Platform yöneticisi | Tersane oluşturma → kullanıcı/tersane/rol seçimi → erişimi gözden geçirme → oluşturma ve atama; ortak katalog türü oluşturma | Geçti | Geçti | Geçti |
| Tersane yöneticisi | Kendi kullanıcılarını arama → düzenleme → kaydetme; ekipmanı ortak listeye açma → gelen talebi onaylama/reddetme → teslim → iade | Geçti | Geçti | Geçti |
| Tersane personeli | Ekipman ekleme → arama → ayrıntı → düzenleme → kapsamı görüp CSV indirme; ortak ekipmanı bulma → talep → takip/iptal | Geçti | Geçti | Geçti |

Personelin örnek Excel dosyasını seçme → inceleme → iki hazır satırı aktarma → gerçek kayıtları doğrulama akışı ayrıca çalıştırıldı. Daha geniş Excel hata, eşleştirme, kısmi kayıt ve taslak durumları kontrollü tarayıcı senaryolarıyla doğrulandı.

Atamasız hesap, yalnız `platform_admin` rol etiketli hesap ve tersaneye bağlı superuser için genel yönetimin açılmadığı kontrol edildi. Mobil görünümde klavyeyle erişim ve gerçek API yanıtları; masaüstü görünümde mevcut yetki regresyonları doğrulandı. Atamasız hesabın envanter eklemesi engelli kaldı; tersaneye bağlı superuser genel yönetim kapsamı kazanmadı.

Tersane yöneticisine kullanıcı oluşturma/başka tersaneye atama yetkisi eklenmedi. Personelde yayın, onay, teslim ve iade düğmeleri açılmadı. Genel yönetim hesabının tersane adına kullanım kararı vermesi 403 ile engelli kaldı. Karşı tersanenin özel kaydı 404; kullanıcı yönetimi 403/404 ile kapalı kaldı. Ortak listede özel kod, teknik JSON ve toplam stok yayımlanmadı.

## Bulunan ve düzeltilen kullanım sorunları

| Sorun | Son davranış |
|---|---|
| Her sayfada menüyü klavyeyle tekrar geçme; mobil menüyü kapatınca odağı kaybetme | İlk Tab ile “İçeriğe geç”; ilk başlık sabit menünün altında görünür. Mobil menüde Escape, odağı açma düğmesine döndürür. |
| Uzun tür listesindeki aktif seçeneğin görünmemesi; seçenekler arasında çok sayıda gereksiz Tab; seçim/değiştirme sonrası odak kaybı | Ok tuşlarıyla aktif seçenek görünür kalır; Enter seçer, Escape geri döner; seçim sonrası miktar alanından devam edilir. |
| İç içe açılan taslak uyarısından vazgeçince odağın sayfa gövdesine düşmesi | Üstteki uyarı kapandığında odak kalan pencereye döner; Tab pencerenin kontrollerinden sürer. Vazgeçmek kayıt isteği göndermez. |
| Mobil kullanım talebinde karar düğmelerini bulmak için uzun içerikte kaydırma | Sunucunun izin verdiği mevcut işlemler pencerenin sabit alt alanında erişilebilir. |
| Talep yönleri arasında belirsiz klavye geçişi; geçersiz formda yanlış yerde kalma; sonuçtan sonra belirsiz odak | Yön sekmeleri ok/Home/End ile çalışır. Hatalı adet/tarih alanına, başarılı sonuçta durum/takip işlemine odak taşınır. |
| Gelen veya filtrelenmiş boş talepler için yanlış sonraki adım | Gelen talepler ve filtre sonucu ayrı açıklanır; uygun durumda durum filtresini temizleme sunulur. |
| 320 px ekranda uzun envanter kodunun kesilmesi | Kod satıra sarılır; kayıt işlemleri erişilebilir kalır. |
| Personel yardımının kullanamadığı paylaşım işlemini önermesi; İngilizce tekil sayılar | Açıklama mevcut role göre gösterilir; tek kayıt/sonuç metni tekil olur. |
| Excel önizlemesinde onay alanının True/False göstermesi | Yalnız checkbox tipindeki değerler Evet/Hayır veya Yes/No gösterilir. Metin hücresindeki gerçek True/False ve aktarılan dosya/payload korunur. |

## Rehber ve ekranlar

Uygulama içi rehber, Türkçe Markdown rehberi ve çevrimdışı HTML güncel akışlarla eşleştirildi. Excel/şablon girişleri, dışa aktarma kapsamı, kullanıcı oluşturma-atama, kurumun talepleri, yayın yetkileri ve “İşlemi tamamla” adımı düzeltildi. Platform hesabına yanlış hesap ataması öneren kullanım açıklaması kaldırıldı.

Güncel kurmaca verili aktarım, paylaşım, talep, onay ve iade görselleri ortak `frontend/public/guide/images` kaynağında yenilendi. Eski `docs/images` bağlantıları kaldırıldı. HTML rehberinde tüm görseller yükleniyor; arama/temizleme, klavyeyle tema/bölüm bağlantıları, masaüstü ve mobil taşma kontrolleri geçti.

## Doğrulama sonuçları

| Kontrol | Sonuç |
|---|---|
| Kontrollü tarayıcı senaryoları | 403 farklı senaryo doğrulandı. İlk paralel koşu: 386 geçti, 17 süre aşımı. Aynı 17 senaryo tek tarayıcıyla yeniden: 17/17 geçti (55,5 sn). |
| P3 yeni arayüz senaryoları | 47 senaryo; yukarıdaki 403 toplamına dahil. |
| Gerçek API kabulü | 16 farklı senaryo: rol/envanter/platform paketi 10/10; son paylaşım ve yönetici kullanıcı paketi 6/6 (27,7 sn). |
| Sunucu regresyonları | 196/196 geçti. Yetki, tenant izolasyonu, envanter, Excel, katalog, kullanım ve bildirim/ayar kapsamı. |
| Bağımsız odaklı tarayıcı kontrolü | 34/34 geçti; 403 toplamının alt kümesi. |
| Tip denetimi, P3 odaklı lint, diff kontrolü | Geçti. |
| Üretim derlemesi | Geçti; mevcut büyük paket uyarısı sürüyor. |
| Çevrimdışı rehber | 1440/390 px; tüm görseller, arama/temizleme, klavye etkileşimleri, taşma ve sayfa hatası kontrolleri geçti. |

İlk geniş koşudaki 17 süre aşımı, eşzamanlı doğrulamalar bittikten sonra aynı süre sınırları ve başarı koşullarıyla yeniden kontrol edildi. Sonuçlar yukarıda iki koşu olarak ayrılmıştır.

Gerçek sunucunun ilk 13 senaryolu koşusunda klavyeyle iade testinin yanıt gözlemcisi, Tab ile düğmeye ulaşma süresini de kapsıyordu ve süre aştı; sunucuda iade POST’u 200 ile kaydedilmişti. Test, önce klavyeyle düğmeye ulaşıp ardından yanıt gözlemcisi ve Enter’ı birlikte bekleyecek şekilde düzeltildi. İzin/veri/durum doğrulamaları ve zaman sınırları korunarak son altı senaryo geçti. Başarısız koşudan kalan kurmaca kayıtların sonraki aramayla çakışmaması için test tür adları benzersizleştirildi.

Yerel kanıtlar: [ilk geniş koşu](/private/tmp/p3-frontend-final.log), [17 senaryonun tekli kontrolü](/private/tmp/p3-frontend-recheck.log), [ilk gerçek API koşusu](/private/tmp/p3-real-final.log), [son altı gerçek senaryo](/private/tmp/p3-real-shared-users-final.log).

Bağımsız kod ve TypeScript incelemelerinde açık kritik, yüksek veya orta bulgu kalmadı. Yetki kontrolleri, sunucunun izin verdiği talep işlemleri, özel veri ayrımı, gönderilen veriler ve taslak koruması ayrıca incelendi.

## Test ortamı ve sınırlar

- Gerçek API kontrolleri ayrı yerel P3 demo veritabanı ve kurmaca hesaplarla çalıştırıldı; mevcut kullanıcı demosu ve canlı veri kullanılmadı.
- Chromium: 1440 px masaüstü, 390 px dokunmatik mobil benzetimi; ilgili envanter/gezinme bileşenleri ayrıca 320 px. Klavye kontrolleri Tab/Shift+Tab, Enter/Space, Escape ve ilgili ok/Home/End davranışlarını kapsıyor.
- Fiziksel telefon, Safari/Firefox ve ekran okuyucuyla ayrı kabul yapılmadı.
- P3 öncesi bilinen genel lint sonucu 24 hata/2 uyarıydı. P3 dosyalarının odaklı lint kontrolü geçti; genel lint temizliği iddiası yok. Derlemenin 500 kB üzeri paket uyarısı sürüyor.
- Büyük veri performansı, aktarım geçmişi/yalnız hatalı satır kurtarma, bakım/hasar kanıtı gibi ayrı ürün işleri bu aşamaya alınmadı; [güncel GAP kaydı](UI_GAP_ANALIZI.md) içinde açıkça ayrıldı.

## Kanıt ve tekrar kontrolü

- Kontrollü arayüz senaryoları: `frontend/tests`; P3 için 47 yeni senaryo.
- Gerçek API akışları: `frontend/acceptance-tests`, `frontend/playwright.acceptance.config.ts`. Varsayılan hedef ayrı P3 demosu `127.0.0.1:5191`; demo health kontrolü zorunlu.
- Kabul testleri standart kurmaca demo hesaplarını ve ek atamasız/rol etiketli/tersaneye bağlı superuser sınır hesaplarını gerektirir. Test verisi kurulumları gerçek canlı sisteme yönelik değildir.
- Güncel rehberler: [Markdown](KULLANIM_REHBERI.md), [çevrimdışı HTML](kullanim-rehberi.html).
