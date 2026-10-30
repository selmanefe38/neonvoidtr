# NEON VOID — Web Edition (P2P)

Tarayıcı tabanlı NEON VOID. Tek oyunculu modun yanında PeerJS/WebRTC ile iki oyunculu doğrudan bağlantı kullanır.

## Yayınlama (yalnızca GitHub)

1. Bu klasördeki dosyaları GitHub deposunun kök dizinine yükle.
2. GitHub → Settings → Pages → Deploy from a branch → `main` / `/root` seç.
3. Pages adresin açılınca oyunu çalıştır.

## Online nasıl çalışır?

- Oda kuran kişinin tarayıcısı oda sahibi olur; oyun sekmesini açık ve internet bağlantısını aktif tutmalıdır.
- Oda sahibi 1v1 veya Puan Yarışı odası kurar. Ekranda `neonvoid-xxxxxx` biçiminde oda kodu çıkar.
- Arkadaşı kendi tarayıcısından aynı GitHub Pages bağlantısını açar, kodu yazar ve katılır.
- Oyun verileri WebRTC DataConnection üzerinden mümkün olduğunda doğrudan iki tarayıcı arasında akar.
- PeerJS'in varsayılan bulut PeerServer'ı yalnızca eşleri buluşturmak/sinyalleşme için kullanılır. GitHub Pages tek başına eş bulma servisi değildir; bu projede ayrı bir sunucu kurmadan PeerJS'in varsayılan servisi kullanılır.

## Önemli sınırlar

- Bu sürümde oda sahibi sekmeyi kapatırsa oda kapanır.
- Bazı okul/iş ağları, mobil operatör NAT'ı veya katı güvenlik duvarları doğrudan P2P bağlantıyı engelleyebilir. Böyle bir ağda TURN aktarma sunucusu gerekebilir; bu projeye özel TURN hizmeti eklenmemiştir.
- PeerJS'in herkese açık varsayılan sinyalleşme servisi üçüncü taraf hizmetidir; kullanılabilirliği ve limitleri bizim kontrolümüzde değildir.
- Bu, orijinal Pygame oyununun birebir portu değildir. Web sürümünde temel uzay savaşı, tek oyunculu mod, oda kurma/katılma ve canlı rakip durumu aktarımı vardır.

## Kontroller

- WASD / oklar: hareket
- SPACE: ateş
- B: bomba
- P: duraklat
