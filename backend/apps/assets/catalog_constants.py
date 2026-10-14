"""GISBIR catalog metadata. Categories and sharing grades are separate axes."""

CATEGORIES = [
    ('A', 'İskele ve erişim sistemleri'),
    ('B', 'Kaldırma ekipmanları'),
    ('C', 'Kaynak ekipmanları'),
    ('D', 'Kesme ve metal işleme'),
    ('E', 'Enerji ekipmanları'),
    ('F', 'Hava ve gaz sistemleri'),
    ('G', 'İş makineleri ve istifleme'),
    ('H', 'Gemi bakım-onarım ve yüzey işlem ekipmanları'),
    ('I', 'Ölçüm ve test ekipmanları'),
    ('J', 'Mekanik atölye ekipmanları'),
    ('K', 'Elektrikli ve el aletleri'),
    ('L', 'İş güvenliği ekipmanları'),
    ('M', 'Çevre ekipmanları'),
]

DEFAULT_SCHEMA = [
    {'key': 'asset_code', 'label': 'Ekipman kodu', 'type': 'text', 'required': False,
     'is_unique_key': True, 'role': 'identifier'},
    {'key': 'brand', 'label': 'Marka', 'type': 'text', 'required': False},
    {'key': 'model', 'label': 'Model', 'type': 'text', 'required': False},
    {'key': 'capacity', 'label': 'Kapasite ve birimi', 'type': 'text', 'required': False},
]
