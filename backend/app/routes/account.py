"""
Account Routes - Gerenciamento de contas (Paper Trading + Exchanges Reais)
"""

from fastapi import APIRouter, HTTPException, Body
from typing import Optional, List
from pydantic import BaseModel

from ..services.paper_trading import paper_trading_service
from ..services.exchange import exchange_service
from ..services import learning_store

router = APIRouter(prefix="/api/account", tags=["account"])


# ============= SCHEMAS =============

class PaperTradeRequest(BaseModel):
    symbol: str
    side: str  # BUY ou SELL
    amount: float
    price: float
    strategy: Optional[str] = "manual"


class PositionOpenRequest(BaseModel):
    symbol: str
    side: str
    notional_usd: float
    leverage: Optional[int] = 1


class PositionCloseRequest(BaseModel):
    exit_price: Optional[float] = None


class ExchangeConnectRequest(BaseModel):
    exchange: str
    api_key: str
    api_secret: str
    testnet: Optional[bool] = False


class RealTradeRequest(BaseModel):
    exchange: str
    symbol: str
    side: str  # BUY ou SELL
    order_type: str  # market ou limit
    amount: float
    price: Optional[float] = None


# ============= PAPER TRADING =============

@router.get("/paper/balance")
async def get_paper_balance(user_id: str = "demo_user"):
    """Retorna saldos da conta paper trading"""
    account = paper_trading_service.get_or_create_account(user_id)
    
    # Preços fixos para cálculo de P&L (será atualizado com preços reais depois)
    prices = {
        'BTCUSDT': 88000,
        'ETHUSDT': 3200,
        'BNBUSDT': 320,
        'SOLUSDT': 110,
        'XRPUSDT': 0.60,
        'ADAUSDT': 0.50,
        'DOGEUSDT': 0.08
    }
    
    pnl = account.calculate_pnl(prices)
    positions = account.get_positions()
    
    return {
        "account_type": "paper_trading",
        "balances": account.get_all_balances(),
        "pnl": pnl,
        "positions": positions,
        "created_at": account.created_at.isoformat()
    }


@router.post("/paper/trade")
async def execute_paper_trade(
    trade: PaperTradeRequest,
    user_id: str = "demo_user"
):
    """Executa um trade na conta paper trading"""
    account = paper_trading_service.get_or_create_account(user_id)
    
    result = account.execute_trade(
        symbol=trade.symbol,
        side=trade.side,
        amount=trade.amount,
        price=trade.price,
        strategy=trade.strategy
    )
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return {
        "success": True,
        "message": f"Trade executado: {trade.side} {trade.amount} {trade.symbol}",
        "trade": result['trade'],
        "balances": result['balances']
    }


@router.post('/paper/position')
async def open_paper_position(req: PositionOpenRequest, user_id: str = 'demo_user'):
    """Abre posição alavancada na conta paper trading"""
    account = paper_trading_service.get_or_create_account(user_id)
    result = account.open_position(symbol=req.symbol, side=req.side, notional_usd=req.notional_usd, leverage=req.leverage or 1)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error'))
    return result


@router.get('/paper/positions')
async def list_paper_positions(user_id: str = 'demo_user'):
    account = paper_trading_service.get_or_create_account(user_id)
    return {'positions': account.get_positions()}


@router.post('/paper/positions/{position_id}/close')
async def close_paper_position(position_id: str, body: PositionCloseRequest = Body(...), user_id: str = 'demo_user'):
    account = paper_trading_service.get_or_create_account(user_id)
    # if exit_price not provided, use static price map
    exit_price = body.exit_price
    if exit_price is None:
        prices = {
            'BTCUSDT': 88000,
            'ETHUSDT': 3200,
            'BNBUSDT': 320,
            'SOLUSDT': 110,
            'XRPUSDT': 0.60,
            'ADAUSDT': 0.50,
            'DOGEUSDT': 0.08
        }
        pos = next((p for p in account.get_positions() if p['id'] == position_id), None)
        if not pos:
            raise HTTPException(status_code=404, detail='Posição não encontrada')
        exit_price = prices.get(pos['symbol'], None)
        if exit_price is None:
            raise HTTPException(status_code=400, detail='Preço de saída não disponível; forneça exit_price')

    result = account.close_position(position_id, exit_price)
    if not result.get('success'):
        raise HTTPException(status_code=400, detail=result.get('error'))
    return result


@router.get('/paper/positions/{position_id}/report')
async def get_position_report(position_id: str, user_id: str = 'demo_user'):
    account = paper_trading_service.get_or_create_account(user_id)
    result = account.generate_learning_report(position_id)
    if not result.get('success'):
        raise HTTPException(status_code=404, detail=result.get('error'))
    return result


@router.get('/paper/reports')
async def list_learning_reports(limit: int = 100):
    """Lista relatórios de aprendizado salvos"""
    reports = learning_store.list_reports(limit=limit)
    return {'reports': reports, 'count': len(reports)}


@router.get('/paper/reports/{position_id}')
async def get_saved_report(position_id: str):
    report = learning_store.load_report(position_id)
    if not report:
        raise HTTPException(status_code=404, detail='Relatório não encontrado')
    return {'report': report}


@router.get("/paper/history")
async def get_paper_trade_history(
    user_id: str = "demo_user",
    limit: int = 50
):
    """Retorna histórico de trades paper trading"""
    account = paper_trading_service.get_or_create_account(user_id)
    
    return {
        "account_type": "paper_trading",
        "trades": account.get_trade_history(limit),
        "total_trades": account.total_trades
    }


@router.post("/paper/reset")
async def reset_paper_account(user_id: str = "demo_user"):
    """Reseta conta paper trading (volta para $10k)"""
    account = paper_trading_service.get_or_create_account(user_id)
    account.reset_account(initial_balance=10000.0)
    return {
        "success": True,
        "message": "Conta resetada com sucesso",
        "balance": account.get_all_balances()
    }


# ============= REAL EXCHANGES =============

@router.get("/exchanges/supported")
async def get_supported_exchanges():
    """Lista exchanges suportadas"""
    return {
        "exchanges": exchange_service.get_supported_exchanges()
    }


@router.post("/exchanges/connect")
async def connect_exchange(
    connection: ExchangeConnectRequest,
    user_id: str = "demo_user"
):
    """Conecta a uma exchange real"""
    result = await exchange_service.connect_exchange(
        user_id=user_id,
        exchange_name=connection.exchange,
        api_key=connection.api_key,
        api_secret=connection.api_secret,
        testnet=connection.testnet
    )
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return result


@router.get("/exchanges/list")
async def list_user_exchanges(user_id: str = "demo_user"):
    """Lista exchanges conectadas do usuário"""
    exchanges = exchange_service.get_user_exchanges(user_id)
    
    return {
        "connected_exchanges": exchanges,
        "count": len(exchanges)
    }


@router.delete("/exchanges/{exchange_name}")
async def disconnect_exchange(
    exchange_name: str,
    user_id: str = "demo_user"
):
    """Desconecta de uma exchange"""
    result = exchange_service.disconnect_exchange(user_id, exchange_name)
    
    if not result['success']:
        raise HTTPException(status_code=404, detail=result['error'])
    
    return result


@router.get("/exchanges/{exchange_name}/balance")
async def get_exchange_balance(
    exchange_name: str,
    user_id: str = "demo_user"
):
    """Retorna saldos da exchange"""
    connection = exchange_service.get_connection(user_id, exchange_name)
    
    if not connection:
        raise HTTPException(status_code=404, detail="Exchange não conectada")
    
    try:
        balance = await connection.get_balance()
        return {
            "exchange": exchange_name,
            "balances": balance
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/exchanges/trade")
async def execute_real_trade(
    trade: RealTradeRequest,
    user_id: str = "demo_user"
):
    """Executa trade em exchange real"""
    connection = exchange_service.get_connection(user_id, trade.exchange)
    
    if not connection:
        raise HTTPException(
            status_code=404,
            detail=f"Exchange {trade.exchange} não conectada"
        )
    
    result = await connection.create_order(
        symbol=trade.symbol,
        side=trade.side,
        order_type=trade.order_type,
        amount=trade.amount,
        price=trade.price
    )
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return result


@router.get("/exchanges/{exchange_name}/orders")
async def get_open_orders(
    exchange_name: str,
    user_id: str = "demo_user",
    symbol: Optional[str] = None
):
    """Retorna ordens abertas na exchange"""
    connection = exchange_service.get_connection(user_id, exchange_name)
    
    if not connection:
        raise HTTPException(status_code=404, detail="Exchange não conectada")
    
    try:
        orders = await connection.get_open_orders(symbol)
        return {
            "exchange": exchange_name,
            "orders": orders,
            "count": len(orders)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/exchanges/{exchange_name}/history")
async def get_exchange_trade_history(
    exchange_name: str,
    user_id: str = "demo_user",
    symbol: Optional[str] = None,
    limit: int = 50
):
    """Retorna histórico de trades da exchange"""
    connection = exchange_service.get_connection(user_id, exchange_name)
    
    if not connection:
        raise HTTPException(status_code=404, detail="Exchange não conectada")
    
    try:
        trades = await connection.get_trade_history(symbol, limit)
        return {
            "exchange": exchange_name,
            "trades": trades,
            "count": len(trades)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/exchanges/{exchange_name}/orders/{order_id}")
async def cancel_order(
    exchange_name: str,
    order_id: str,
    symbol: str,
    user_id: str = "demo_user"
):
    """Cancela uma ordem"""
    connection = exchange_service.get_connection(user_id, exchange_name)
    
    if not connection:
        raise HTTPException(status_code=404, detail="Exchange não conectada")
    
    result = await connection.cancel_order(order_id, symbol)
    
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    
    return result


# ============= OVERVIEW =============

@router.get("/overview")
async def get_account_overview(user_id: str = "demo_user"):
    """Retorna visão geral de todas as contas (paper + exchanges)"""
    
    # Paper trading
    paper_account = paper_trading_service.get_or_create_account(user_id)
    prices = {
        'BTCUSDT': 88000,
        'ETHUSDT': 3200,
        'BNBUSDT': 320,
        'SOLUSDT': 110
    }
    
    paper_pnl = paper_account.calculate_pnl(prices)
    
    # Exchanges conectadas
    connected_exchanges = exchange_service.get_user_exchanges(user_id)
    
    # Total de exchanges
    exchange_balances = []
    for exchange_name in connected_exchanges:
        connection = exchange_service.get_connection(user_id, exchange_name)
        if connection:
            try:
                balance = await connection.get_balance()
                exchange_balances.append({
                    "exchange": exchange_name,
                    "balances": balance
                })
            except:
                pass
    
    return {
        "user_id": user_id,
        "paper_trading": {
            "balance": paper_account.get_all_balances(),
            "pnl": paper_pnl,
            "total_value_usd": paper_pnl['current_value']
        },
        "exchanges": {
            "connected": connected_exchanges,
            "count": len(connected_exchanges),
            "balances": exchange_balances
        }
    }
