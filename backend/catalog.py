"""Server-side definition of the virtual room shop.

Prices live on the server so a client cannot buy an item for an arbitrary
price. ``price`` is expressed in coins.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass(frozen=True)
class ShopItem:
    key: str
    name: str
    price: int
    emoji: str


SHOP_ITEMS: List[ShopItem] = [
    ShopItem("poster", "Плакат Супергероев", 10, "🖼️"),
    ShopItem("lamp", "Торшер", 15, "💡"),
    ShopItem("toybox", "Ящик для игрушек", 20, "📦"),
    ShopItem("comics", "Полка с комиксами", 25, "📚"),
    ShopItem("bed", "Кровать супергероя", 40, "🛏️"),
    ShopItem("aquarium", "Аквариум", 50, "🐠"),
    ShopItem("cat", "Кот Рыжик", 60, "🐈"),
    ShopItem("pc", "Игровой ПК", 80, "🖥️"),
]

SHOP_BY_KEY: Dict[str, ShopItem] = {item.key: item for item in SHOP_ITEMS}


def get_shop_item(key: str) -> Optional[ShopItem]:
    return SHOP_BY_KEY.get(key)
