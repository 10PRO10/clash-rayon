import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'https://fvusxxmnqwjmapyibdna.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2dXN4eG1ucXdqbWFweWliZG5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMjA3NzUsImV4cCI6MjA4ODg5Njc3NX0.8XLqBvkJLSADyxiYNCx110zCal3djtR5JVyzLdrsXsM'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Функция для сохранения результата
export async function saveScore(playerName, isWin) {
    // Ищем игрока
    let { data: player } = await supabase
        .from('scores')
        .select('*')
        .eq('player_name', playerName)
        .single()
    
    if (player) {
        // Обновляем
        await supabase
            .from('scores')
            .update({
                wins: isWin ? player.wins + 1 : player.wins,
                losses: isWin ? player.losses : player.losses + 1,
                total_games: player.total_games + 1
            })
            .eq('player_name', playerName)
    } else {
        // Создаем нового
        await supabase
            .from('scores')
            .insert([{
                player_name: playerName,
                wins: isWin ? 1 : 0,
                losses: isWin ? 0 : 1,
                total_games: 1
            }])
    }
}

// Получить топ игроков
export async function getTopScores(limit = 10) {
    const { data, error } = await supabase
        .from('scores')
        .select('*')
        .order('wins', { ascending: false })
        .limit(limit)
    
    return data || []
}