/**
 * Sync Manager with Defensive Logging and Progress Tracking
 * 
 * Handles batch processing and progress updates with safe string formatting
 */

export interface SyncResult {
  success: boolean;
  jobId: string;
  message: string;
  stats: {
    totalProcessed: number;
    totalInserted: number;
    totalUpdated: number;
    totalErrors: number;
    pagesProcessed: number;
  };
}

export class SyncManager {
  private supabaseClient: any;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Update sync progress with defensive guards
   */
  async updateProgress(jobId: string, processed: number, total: number): Promise<void> {
    try {
      const safeProcessed = typeof processed === 'number' ? processed : 0;
      const safeTotal = typeof total === 'number' ? total : 0;
      
      console.log(`📊 Sync progress for ${jobId}: ${safeProcessed}/${safeTotal}`);
      
      // Update set status with safe values
      await this.supabaseClient
        .from('sets')
        .update({ 
          cards_synced_count: safeProcessed,
          last_synced_at: new Date().toISOString()
        })
        .eq('jt_set_id', jobId);
        
    } catch (error) {
      console.error(`❌ Error updating progress for ${jobId}:`, error.message);
      // Don't throw - progress updates should not fail the sync
    }
  }

  /**
   * Process cards in batches with defensive guards
   */
  async batchProcess<T>(
    items: T[], 
    processor: (batch: T[]) => Promise<any>,
    batchSize = 50
  ): Promise<{ processed: number; errors: number }> {
    // Defensive guard for items array
    const safeItems = Array.isArray(items) ? items : [];
    const safeBatchSize = typeof batchSize === 'number' && batchSize > 0 ? batchSize : 50;
    
    let processed = 0;
    let errors = 0;
    
    console.log(`🔄 Processing ${safeItems.length} items in batches of ${safeBatchSize}`);
    
    for (let i = 0; i < safeItems.length; i += safeBatchSize) {
      const batch = safeItems.slice(i, i + safeBatchSize);
      
      try {
        await processor(batch);
        processed += batch.length;
        console.log(`✅ Processed batch ${Math.floor(i / safeBatchSize) + 1}: ${batch.length} items`);
      } catch (error) {
        errors += batch.length;
        console.error(`❌ Error processing batch starting at index ${i}:`, error.message);
        // Continue with next batch instead of failing completely
      }
    }
    
    return { processed, errors };
  }

  /**
   * Create sync result with defensive string formatting
   */
  createResult(
    success: boolean, 
    jobId: string, 
    message: string, 
    stats: Partial<SyncResult['stats']> = {}
  ): SyncResult {
    // Defensive guards for all stats
    const safeStats = {
      totalProcessed: typeof stats.totalProcessed === 'number' ? stats.totalProcessed : 0,
      totalInserted: typeof stats.totalInserted === 'number' ? stats.totalInserted : 0,
      totalUpdated: typeof stats.totalUpdated === 'number' ? stats.totalUpdated : 0,
      totalErrors: typeof stats.totalErrors === 'number' ? stats.totalErrors : 0,
      pagesProcessed: typeof stats.pagesProcessed === 'number' ? stats.pagesProcessed : 0
    };
    
    // Safe string formatting
    const safeJobId = typeof jobId === 'string' ? jobId : 'unknown';
    const safeMessage = typeof message === 'string' ? message : 'No message provided';
    
    return {
      success: Boolean(success),
      jobId: safeJobId,
      message: safeMessage,
      stats: safeStats
    };
  }

  /**
   * Update set status with defensive guards
   */
  async updateSetStatus(
    setId: string, 
    status: 'syncing' | 'completed' | 'error' | 'partial',
    error?: string,
    stats?: Partial<SyncResult['stats']>
  ): Promise<void> {
    try {
      const safeSetId = typeof setId === 'string' ? setId : '';
      const safeStatus = typeof status === 'string' ? status : 'error';
      const safeError = typeof error === 'string' ? error : null;
      
      const updateData: any = {
        sync_status: safeStatus,
        last_synced_at: new Date().toISOString()
      };
      
      if (safeError) {
        updateData.last_sync_error = safeError;
      } else if (safeStatus === 'completed') {
        updateData.last_sync_error = null;
      }
      
      if (stats && typeof stats.totalProcessed === 'number') {
        updateData.cards_synced_count = stats.totalProcessed;
      }
      
      await this.supabaseClient
        .from('sets')
        .update(updateData)
        .eq('jt_set_id', safeSetId);
        
      console.log(`📝 Updated set ${safeSetId} status to: ${safeStatus}`);
      
    } catch (error) {
      console.error(`❌ Error updating set status for ${setId}:`, error.message);
      // Don't throw - status updates should not fail the sync
    }
  }

  /**
   * Check for cancellation signals with defensive guards
   */
  async shouldCancel(operationId?: string): Promise<boolean> {
    try {
      const { data } = await this.supabaseClient
        .from('sync_control')
        .select('should_cancel')
        .or('operation_type.eq.force_stop,operation_type.eq.emergency_stop')
        .limit(1)
        .maybeSingle();
      
      const shouldStop = data?.should_cancel === true;
      
      if (shouldStop && operationId) {
        console.log(`🛑 Cancellation signal received for operation: ${operationId}`);
      }
      
      return shouldStop;
    } catch (error) {
      console.error('❌ Error checking cancellation status:', error.message);
      // If we can't check cancellation status, continue (don't fail the operation)
      return false;
    }
  }
}