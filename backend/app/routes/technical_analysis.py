"""
Technical Analysis Routes
Rotas para análise técnica com confluência institucional
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from app.services.technical_analysis import perform_technical_analysis

router = APIRouter(prefix="/technical-analysis", tags=["technical-analysis"])


@router.get("/{symbol}")
async def get_technical_analysis(
    symbol: str,
    force_refresh: bool = Query(False, description="Forçar atualização ignorando cache"),
):
    """
    Análise técnica completa com confluência institucional
    
    Retorna:
    - **flow**: Análise de fluxo (CVD, Open Interest)
    - **structure**: Análise de estrutura (EMA, VWAP, Tendência)
    - **safety**: Filtros de segurança (RSI, ADX, Fear & Greed)
    - **confluence**: Score de confluência (0-100) com viés
    - **ai_recommendation**: Recomendação algorítmica
    - **ai_text_recommendation**: Análise em texto (IA)
    - **key_levels**: Suportes, Resistências, Zonas de Liquidação
    
    Cache: 15 minutos
    """
    try:
        # Normalizar símbolo
        clean_symbol = symbol.upper().replace("USDT", "") + "USDT"
        
        result = await perform_technical_analysis(clean_symbol, force_refresh)
        return result
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar análise técnica: {str(e)}"
        )


@router.get("/quick/{symbol}")
async def get_quick_analysis(symbol: str):
    """
    Análise rápida - retorna apenas o essencial
    
    Ideal para preview ou listagem
    """
    try:
        clean_symbol = symbol.upper().replace("USDT", "") + "USDT"
        result = await perform_technical_analysis(clean_symbol, force_refresh=False)
        
        return {
            "symbol": result["symbol"],
            "current_price": result["current_price"],
            "bias": result["confluence"]["bias"],
            "score": result["confluence"]["total"],
            "probability": result["confluence"]["probability"],
            "action": result["ai_recommendation"]["action"],
            "summary": result["summary"],
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar análise: {str(e)}"
        )


@router.get("/batch/")
async def get_batch_analysis(
    symbols: str = Query(..., description="Símbolos separados por vírgula (ex: BTC,ETH,SOL)"),
):
    """
    Análise em lote para múltiplos símbolos
    
    Retorna análise rápida para cada símbolo
    """
    try:
        symbol_list = [s.strip().upper() for s in symbols.split(",")]
        results = []
        
        for symbol in symbol_list[:10]:  # Limite de 10 símbolos
            try:
                clean_symbol = symbol.replace("USDT", "") + "USDT"
                result = await perform_technical_analysis(clean_symbol, force_refresh=False)
                
                results.append({
                    "symbol": result["symbol"],
                    "current_price": result["current_price"],
                    "bias": result["confluence"]["bias"],
                    "score": result["confluence"]["total"],
                    "probability": result["confluence"]["probability"],
                    "action": result["ai_recommendation"]["action"],
                })
            except Exception as e:
                results.append({
                    "symbol": symbol,
                    "error": str(e),
                })
        
        return {"analyses": results, "count": len(results)}
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao processar análises: {str(e)}"
        )


@router.get("/opportunities/")
async def get_trading_opportunities(
    min_score: int = Query(70, description="Score mínimo de confluência"),
    bias: Optional[str] = Query(None, description="Filtrar por viés: LONG, SHORT"),
):
    """
    Encontra oportunidades de trading baseadas em confluência alta
    
    Analisa top 10 moedas e retorna as que têm score >= min_score
    """
    top_symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", 
                   "ADAUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT", "LINKUSDT"]
    
    opportunities = []
    
    for symbol in top_symbols:
        try:
            result = await perform_technical_analysis(symbol, force_refresh=False)
            
            if result["confluence"]["total"] >= min_score:
                if bias is None or result["confluence"]["bias"] == bias.upper():
                    opportunities.append({
                        "symbol": result["symbol"],
                        "current_price": result["current_price"],
                        "bias": result["confluence"]["bias"],
                        "score": result["confluence"]["total"],
                        "probability": result["confluence"]["probability"],
                        "action": result["ai_recommendation"]["action"],
                        "entry": result["ai_recommendation"]["entry"],
                        "stop_loss": result["ai_recommendation"]["stop_loss"],
                        "take_profit": result["ai_recommendation"]["take_profit"],
                        "timeframe": result["ai_recommendation"]["timeframe"],
                    })
        except Exception as e:
            print(f"Error analyzing {symbol}: {e}")
            continue
    
    # Ordenar por score
    opportunities.sort(key=lambda x: x["score"], reverse=True)
    
    return {
        "opportunities": opportunities,
        "count": len(opportunities),
        "filters": {"min_score": min_score, "bias": bias},
    }
