package com.agiworkforce.app.native

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.agiworkforce.app.R

class AGIQuickActionsWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
    for (widgetId in widgetIds) {
      val views = RemoteViews(context.packageName, R.layout.agi_quick_actions_widget)
      views.setOnClickPendingIntent(R.id.agi_widget_new_chat, link(context, "chat", 0))
      views.setOnClickPendingIntent(R.id.agi_widget_camera, link(context, "camera", 1))
      views.setOnClickPendingIntent(R.id.agi_widget_voice, link(context, "voice", 2))
      manager.updateAppWidget(widgetId, views)
    }
  }

  private fun link(context: Context, verb: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("agiworkforce://intent/$verb"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }
}
