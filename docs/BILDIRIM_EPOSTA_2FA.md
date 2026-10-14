# Bildirim, canlı e-posta ve isteğe bağlı 2FA

14 Ekim 2026

Bildirimler uygulamada kalır; e-posta kopyaları canlı ortamın SMTP ayarlarıyla gönderilir. Yerel test ortamı dışarıya e-posta göndermez ve canlı SMTP bilgilerini devralmaz. İki faktörlü giriş bütün kullanıcılarda isteğe bağlıdır.

## Hangi e-postalar gönderilir?

| Olay | Alıcı | İçerik |
|---|---|---|
| Envanter Excel aktarımı | İşlemi yapan kullanıcı | Yeni/güncellenen/atlanan/hatalı satır sayıları; dosya başına tek özet |
| Ortak listeye açma veya geri çekme | Sahibi tersanenin aktif yöneticileri | Tür adı ve paylaşım değişikliği; başka tersanenin özel bilgileri yok |
| Giriş, e-posta doğrulama, parola sıfırlama | İlgili hesap adresi | İşlemin gerçek kodu veya bağlantısı; açık işlem ekranında kullanılır |
| Parola/e-posta/2FA/anahtar değişikliği | İlgili hesap; e-posta değişiminde Allauth'ın belirttiği eski adres de korunur | Güvenlik değişikliği ve hesabı kontrol etme bağlantısı |

Her e-postada kurumsal HTML ve düz metin sürümü bulunur. Türkçe/İngilizce, hesap diline göre seçilir. Kod süreleri gerçek ayardan alınır; parola sıfırlama kodu 8 karakterdir. Güvenlik uyarıları OTP, 2FA sırrı veya kurtarma kodu içermez.

**Bildirimler** ekranındaki e-posta tercihi iş bildirimlerini açar/kapatır. Hesap güvenliği uyarıları bu tercihten bağımsızdır. Bildirimi okundu yapmak veya gizlemek, güvenlik e-postasını susturmaz.

## Canlı SMTP'yi aç

1. Canlı uygulamada platform yönetici hesabıyla giriş yapın; **Hesap → Ayarlar** üzerinden SMTP ekranını açın.
2. Gönderen e-posta adresini, SMTP sunucusunu, portunu ve sağlayıcı kullanıcı adını girin. Bu bilgiler sağlayıcınızdan alınır; projede gerçek hesap veya parola varsayılmaz.
3. Sağlayıcıya göre **TLS** veya **SSL** seçin. Yaygın portlar TLS için 587, SSL için 465'tir; sağlayıcının verdiği değer önceliklidir. İkisi birlikte açılmaz; canlıda şifresiz bağlantı kabul edilmez.
4. SMTP parolasını bu ekrana girin. Sağlayıcı iki faktörlü giriş kullanıyorsa desteklediği **uygulama parolası** gerekebilir. Geçici doğrulama kodu SMTP parolası değildir.
5. **Kaydet** seçin. Kimlik doğrulamanız eskimişse önce doğrulayın. 2FA açmış kullanıcı etkin ikinci faktörünü kullanır; açmamış kullanıcıya 2FA kurulumu zorlanmaz.
6. **Test e-postası** işlemini canlıda kendi kontrolünüzdeki adresle çalıştırın. Başarı, SMTP sunucusunun mesajı kabul etmesidir; gelen kutusuna teslim/spam kontrolünü ayrıca yapın.
7. Gönderici alan adının SPF/DKIM/DMARC ayarlarını sağlayıcınızın talimatlarıyla tamamlayın. Kullanılacak SMTP hizmeti ve gerçek teslim henüz bu çalışma sırasında yapılandırılmadı.

Kayıtlı parolayı boş bırakmak mevcut değeri korur. Kullanıcı adını özellikle kaldırmak saklanan parolayı da kaldırır; bu, kimlik doğrulamasız TLS/SSL relay kullanımı içindir. Parola API'den geri okunamaz. SMTP ayarları Django admin üzerinden değiştirilemez; aynı güvenli uygulama ekranı kullanılır.

## İki faktörlü giriş

1. **Hesap → İki faktörlü doğrulama** ekranını açın.
2. Doğrulama uygulamasını seçin; uygulamayla QR kodunu okutun veya kurulum anahtarını girin.
3. Uygulamanın ürettiği 6 haneli kodu girip etkinleştirin.
4. Oluşan kurtarma kodlarını indirin veya kopyalayın; güvenli yerde saklayın. Her kurtarma kodu bir kez kullanılır. Yenileme eski kodları geçersiz kılar ve onay ister.
5. Sonraki girişlerde ikinci faktör doğrulaması istenir. Telefon erişimi yoksa kurtarma kodu kullanın; desteklenen cihazlarda geçiş/güvenlik anahtarı da yönetilebilir.

2FA açılmadan normal giriş devam eder. Açıldıktan sonra ikinci faktör tamamlanmadan özel envantere erişim verilmez. Sunucuda doğrulama süresi dolarsa hassas işlem doğrulama ekranına yönlenir; işlem otomatik tekrarlanmaz. SMTP arızası 2FA kurulumunu kesmez; güvenlik uyarısı kalıcı gönderim kaydında saklanır.

## Sunucuyu hazırlayan kişi için

Üretim dağıtımında migration'ları uygulayın. Bu dilimde SMTP parola alanı, kullanıcı e-posta tercihi ve bildirim gönderim kayıtları için migration eklendi. Mevcut envanter ve hesaplar silinmez; 2FA otomatik zorunlu hale gelmez.

Canlı e-posta ayarı iki yoldan yapılabilir: uygulamadaki kayıtlı SMTP ayarı veya ortam değişkenleri. Kayıtlı ayar önceliklidir. Örnek değişkenler `backend/resources/compose/envs/.env.prod.example` içinde; gerçek parola ve anahtarlar Git'e konmaz.

- `EMAIL_BACKEND`: varsayılan `apps.settings.email_backend.DatabaseEmailBackend`.
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `EMAIL_USE_SSL`, `DEFAULT_FROM_EMAIL`: ortamdan ilk yapılandırma alternatifi.
- `SMTP_CREDENTIAL_KEY`, `MFA_CREDENTIAL_KEY`: ayrı, kalıcı Fernet anahtarları. Bir kez üretin ve veritabanı yedeğiyle güvenli saklayın. Boşsa `DJANGO_SECRET_KEY` üzerinden türetilir; bu durumda secret key değişimi eski şifreli sırların çözülmesini etkiler.
- Celery worker ve beat çalışmalı. `apps.notifications.tasks.retry_pending_notification_emails` her 60 saniye bekleyen gönderimleri tarar. SMTP bağlantı süresi en fazla 15 saniyedir.

Yeni SMTP parolaları ve 2FA sırları şifreli saklanır. Önceki düz SMTP parolası okunabilir; sonraki kayıtta şifrelenir. Önceki 2FA kayıtları kullanılmaya devam eder. Şifreleme anahtarları değişirken mevcut sırlar için kontrollü geçiş gerekir.

## Gönderim sonucu ve sınırlar

Bildirim kaydı ana işlemin başarılı tamamlanmasından sonra gönderime alınır. Redis veya kuyruk kesintisi envanter işlemini geri almaz; kaydedilmiş iş sonradan bulunur. Geçici SMTP hatalarında en fazla üç deneme yapılır. Eksik/hatalı yapılandırma ve kalıcı sunucu reddi otomatik döngüyle tekrar gönderilmez; gönderim durumu **Gönderilemedi** olarak görünür. Düzeltme sonrası başarısız olayların yeniden gönderimi yönetici kontrolünde yapılmalıdır; SMTP ayarını kaydetmek geçmiş kalıcı hataları otomatik yeniden göndermiyor.

Aynı olay kaydı ve kaydedilmiş başarılı gönderim yeniden üretilmez. SMTP sunucusu mesajı kabul ettikten hemen sonra süreç kesilirse yeniden denemede ikinci e-posta oluşabilir; sabit Message-ID kesin tek teslim garantisi değildir. Gerçek sağlayıcı teslimi, spam klasörü ve üretim yükü bu yerel testlerin kapsamı dışında kalır.

Güncel doğrulama sonuçları: [VERIFICATION.md](VERIFICATION.md).
